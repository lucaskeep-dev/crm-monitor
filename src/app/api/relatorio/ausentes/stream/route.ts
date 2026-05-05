import { listarSituacoesVeiculo, sgaRequestRaw } from '@/lib/sga';
import { RdvAbortError } from '@/lib/rdv';
import { obterStatusVeiculoComCache, flushCacheRDV, statsCacheRDV } from '@/lib/cache-rdv';
import { listarRegras, regraSeAplica, salvarCacheAusentes, lerCacheAusentes } from '@/lib/storage';
import { VeiculoAusenteRDV, SGAVeiculo } from '@/types';

export const maxDuration = 300; // 5 minutos

interface SGAListarVeiculoResponse {
  mensagem?: string;
  total_veiculos?: number;
  veiculos?: SGAVeiculo[];
  error?: string[];
}

const RDV_BATCH = 15;
const PAGE_SIZE = 1000;

const lockKey = '__ausentes_stream_running';
function isRunning(): boolean { return Boolean((globalThis as Record<string, unknown>)[lockKey]); }
function setRunning(v: boolean) { (globalThis as Record<string, unknown>)[lockKey] = v; }

export async function GET() {
  const encoder = new TextEncoder();

  if (isRunning()) {
    const body = encoder.encode(
      `data: ${JSON.stringify({ tipo: 'log', msg: 'Outro stream de ausentes já está em execução. Acompanhe o progresso pelo cache.' })}\n\n` +
      `data: ${JSON.stringify({ tipo: 'ja_em_execucao' })}\n\n`,
    );
    return new Response(new ReadableStream({ start(c) { c.enqueue(body); c.close(); } }), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }
  setRunning(true);

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* cliente desconectou */ }
      }

      try {
        const stats = statsCacheRDV();
        send({ tipo: 'log', msg: `Cache RDV: ${stats.tamanho} veículos, ${stats.status_validos} status válidos (TTL 24h)` });

        // 1. Verificar regras
        send({ tipo: 'log', msg: 'Lendo regras FIPE cadastradas...' });
        const regrasAtivas = listarRegras().filter(r => r.ativo);

        if (regrasAtivas.length === 0) {
          send({ tipo: 'erro', msg: 'Nenhuma regra FIPE ativa. Acesse "Regras FIPE" para configurar.' });
          controller.close();
          return;
        }

        const totalTipos = regrasAtivas.reduce((acc, r) => acc + r.tipos.length, 0);
        send({ tipo: 'log', msg: `${regrasAtivas.length} regra(s) ativa(s) cobrindo ${totalTipos} tipo(s) de veículo` });

        // 2. Descobrir código da situação ATIVO
        send({ tipo: 'log', msg: 'Buscando situação ativa no SGA...' });
        const todasSituacoes = await listarSituacoesVeiculo();
        const situacaoAtiva = todasSituacoes.find(s =>
          (s.descricao_situacao || s.situacao || '').toUpperCase() === 'ATIVO'
        );

        if (!situacaoAtiva) {
          send({ tipo: 'erro', msg: 'Situação "ATIVO" não encontrada no SGA.' });
          controller.close();
          return;
        }

        send({ tipo: 'log', msg: `Situação ativa: "${situacaoAtiva.descricao_situacao}" (código ${situacaoAtiva.codigo_situacao})` });

        // 3. Processar página por página — sem carregar tudo na memória
        send({ tipo: 'log', msg: 'Buscando e processando veículos ativos página por página...' });

        let inicio = 0;
        let totalSGA = 0;
        let paginaNum = 0;
        let candidatosTotal = 0;

        // Carrega cache anterior — preserva entradas até reprocessamento
        const cacheAnterior = lerCacheAusentes();
        const mapaResultados = new Map<string, VeiculoAusenteRDV>();
        if (cacheAnterior?.veiculos) {
          for (const v of cacheAnterior.veiculos) {
            const k = (v.placa || v.chassi || '').toUpperCase().trim();
            if (k) mapaResultados.set(k, v);
          }
        }
        if (mapaResultados.size > 0) {
          send({ tipo: 'log', msg: `Cache anterior: ${mapaResultados.size} ausentes preservados — serão atualizados conforme reprocessados` });
        }

        // Coleta placas vistas no SGA ativo nesta rodada — só removemos as ausentes que NÃO foram vistas APÓS conclusão completa
        const placasSGAativo = new Set<string>();

        function persistirParcial(status: 'em_progresso' | 'erro') {
          try {
            const lista = Array.from(mapaResultados.values());
            salvarCacheAusentes({
              total: lista.length,
              veiculos: lista,
              gerado_em: new Date().toISOString(),
              status,
              verificados: candidatosTotal,
              total_alvo: totalSGA,
            });
          } catch { /* noop */ }
        }

        while (true) {
          paginaNum++;
          const raw = await sgaRequestRaw('listar/veiculo', {
            method: 'POST',
            body: JSON.stringify({
              codigo_situacao: situacaoAtiva.codigo_situacao,
              inicio_paginacao: inicio,
              quantidade_por_pagina: PAGE_SIZE,
            }),
          }) as SGAListarVeiculoResponse;

          if (raw.error) {
            throw new Error(`SGA: ${raw.mensagem || ''} — ${raw.error.join(', ')}`);
          }

          const pagina: SGAVeiculo[] = raw.veiculos || [];
          if (totalSGA === 0 && raw.total_veiculos) totalSGA = raw.total_veiculos;

          if (pagina.length === 0) break;

          // Filtrar candidatos desta página
          const candidatosPagina = pagina.filter(v => {
            const codigoTipo = Number(v.codigo_tipo || v.codigo_tipo_veiculo || 0);
            const valorFipe = Number(v.valor_fipe || 0);
            const codigoClassificacao = Number(v.codigo_classificacao || 0);
            return regrasAtivas.some(r => regraSeAplica(r, codigoTipo, valorFipe, codigoClassificacao));
          });

          candidatosTotal += candidatosPagina.length;
          const carregados = inicio + pagina.length;
          send({
            tipo: 'log',
            msg: `Página ${paginaNum}: ${carregados}/${totalSGA} veículos — ${candidatosPagina.length} candidato(s) nesta página (${candidatosTotal} total)`,
          });

          // Marca todas as placas desta página como vistas no SGA ativo
          for (const v of pagina) {
            const k = (v.placa || v.chassi || '').toUpperCase().trim();
            if (k) placasSGAativo.add(k);
          }

          // Cruzar candidatos desta página com RDV em batches
          for (let i = 0; i < candidatosPagina.length; i += RDV_BATCH) {
            const batch = candidatosPagina.slice(i, i + RDV_BATCH);

            const checagens = await Promise.allSettled(
              batch.map(async (v) => {
                const k = (v.placa || v.chassi || '').toUpperCase().trim();
                if (!k) return { chave: '', resultado: null };

                const statusRDV = await obterStatusVeiculoComCache(v.placa || undefined, v.chassi || undefined);
                if (statusRDV.existe) return { chave: k, resultado: null }; // não é mais ausente

                const codigoTipo = Number(v.codigo_tipo || v.codigo_tipo_veiculo || 0);
                const valorFipe = Number(v.valor_fipe || 0);

                // Calcular meses ativo a partir da data_contrato
                let meses_ativo: number | null = null;
                if (v.data_contrato) {
                  const dataStr = v.data_contrato.replace(/([+-]\d{2}):?(\d{2})$/, '');
                  const dt = new Date(dataStr);
                  if (!isNaN(dt.getTime())) {
                    meses_ativo = Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24 * 30));
                  }
                }

                const item: VeiculoAusenteRDV = {
                  placa: v.placa || '',
                  chassi: v.chassi || '',
                  modelo: v.modelo || '',
                  marca: v.marca || '',
                  tipo_veiculo: v.tipo || v.tipo_veiculo || String(codigoTipo),
                  classificacao: v.categoria || '',
                  valor_fipe: valorFipe,
                  meses_ativo,
                  codigo_associado: v.codigo_associado ? Number(v.codigo_associado) : null,
                  nome_associado: v.nome_associado || null,
                  cpf_associado: v.cpf_associado || null,
                };
                return { chave: k, resultado: item };
              })
            );

            for (const r of checagens) {
              if (r.status === 'rejected' && r.reason instanceof RdvAbortError) {
                persistirParcial('erro');
                throw r.reason;
              }
              if (r.status === 'fulfilled' && r.value && r.value.chave) {
                const { chave, resultado } = r.value;
                if (resultado) mapaResultados.set(chave, resultado);
                else mapaResultados.delete(chave);
              }
            }
          }

          // Emitir progresso de RDV ao fim de cada página
          send({
            tipo: 'rdv_progresso',
            verificados: inicio + pagina.length,
            total: totalSGA || (inicio + pagina.length),
            encontrados: mapaResultados.size,
          });

          // Persistir parcial a cada página (segura contra crash/reload)
          persistirParcial('em_progresso');

          inicio += pagina.length;
          if (pagina.length < PAGE_SIZE) break;
        }

        // Após scan completo: remove entradas que não aparecem mais no SGA ativo
        let removidosForaSGA = 0;
        for (const k of Array.from(mapaResultados.keys())) {
          if (!placasSGAativo.has(k)) { mapaResultados.delete(k); removidosForaSGA++; }
        }
        if (removidosForaSGA > 0) {
          send({ tipo: 'log', msg: `Removidas ${removidosForaSGA} entrada(s) que saíram do SGA ativo` });
        }

        send({ tipo: 'log', msg: `Concluído — ${candidatosTotal} candidato(s) verificado(s), ${mapaResultados.size} sem rastreador` });

        const gerado_em = new Date().toISOString();
        const resultado = Array.from(mapaResultados.values());
        salvarCacheAusentes({
          total: resultado.length,
          veiculos: resultado,
          gerado_em,
          status: 'concluido',
          verificados: candidatosTotal,
          total_alvo: totalSGA,
        });
        send({ tipo: 'concluido', total: resultado.length, veiculos: resultado, gerado_em });

      } catch (err) {
        send({ tipo: 'erro', msg: String(err) });
      } finally {
        try { flushCacheRDV(); } catch { /* noop */ }
        setRunning(false);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
