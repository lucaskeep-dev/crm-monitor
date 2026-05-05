import { NextRequest } from 'next/server';
import { sgaRequestRaw, listarSituacoesVeiculo } from '@/lib/sga';
import { RdvAbortError } from '@/lib/rdv';
import { obterUltimaPosicaoComCache, flushCacheRDV, statsCacheRDV } from '@/lib/cache-rdv';
import { salvarCacheSemPontuar, lerCacheSemPontuar } from '@/lib/storage';
import { VeiculoSemPontuar, SGAVeiculo } from '@/types';

export const maxDuration = 300;

interface SGAListarVeiculoResponse {
  mensagem?: string;
  total_veiculos?: number;
  veiculos?: SGAVeiculo[];
  error?: string[];
}

const RDV_BATCH = 10;
const PAGE_SIZE = 1000;

const lockKey = '__sem_pontuar_stream_running';
function isRunning(): boolean { return Boolean((globalThis as Record<string, unknown>)[lockKey]); }
function setRunning(v: boolean) { (globalThis as Record<string, unknown>)[lockKey] = v; }

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const diasFiltro = Number(searchParams.get('dias') || '30');
  const situacoesParam = searchParams.get('situacoes') || '';
  const codigosSituacao = situacoesParam
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => !isNaN(n) && n > 0);

  const encoder = new TextEncoder();

  if (isRunning()) {
    const body = encoder.encode(
      `data: ${JSON.stringify({ tipo: 'log', msg: 'Outro stream de sem-pontuar já está em execução. Acompanhe o progresso pelo cache.' })}\n\n` +
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
        send({ tipo: 'log', msg: `Cache RDV: ${stats.tamanho} veículos, ${stats.posicao_validas} posições válidas (TTL 12h)` });
        send({ tipo: 'log', msg: `Filtro: veículos sem atualização há ${diasFiltro} ou mais dias` });

        // Buscar todas as situações do SGA (precisamos do nome para exibir na coluna)
        send({ tipo: 'log', msg: 'Buscando situações no SGA...' });
        const todasSituacoes = await listarSituacoesVeiculo();
        const mapaSituacoes = new Map<number, string>();
        for (const s of todasSituacoes) {
          mapaSituacoes.set(Number(s.codigo_situacao), s.descricao_situacao || s.situacao);
        }

        // Se nenhuma situação foi passada, consulta todas
        let codigosFinal = codigosSituacao;
        if (codigosFinal.length === 0) {
          codigosFinal = todasSituacoes.map(s => Number(s.codigo_situacao));
          send({ tipo: 'log', msg: `Nenhuma situação especificada — consultando todas as ${codigosFinal.length} situações` });
        } else {
          send({ tipo: 'log', msg: `Situações selecionadas: ${codigosFinal.length}` });
        }

        let totalVerificadosRDV = 0;
        let totalSGA = 0;
        let primeiraResposta: Record<string, unknown> | null = null;

        // Carrega cache anterior — preserva entradas até reprocessamento
        const cacheAnterior = lerCacheSemPontuar();
        const mapaResultados = new Map<string, VeiculoSemPontuar>();
        if (cacheAnterior?.veiculos) {
          for (const v of cacheAnterior.veiculos) {
            const k = (v.placa || v.chassi || '').toUpperCase().trim();
            // Se filtro de dias mudou, descarta entradas que não passariam mais
            if (k && (v.dias_sem_pontuar ?? 0) >= diasFiltro) mapaResultados.set(k, v);
          }
        }
        if (mapaResultados.size > 0) {
          send({ tipo: 'log', msg: `Cache anterior: ${mapaResultados.size} sem-pontuar preservados — serão atualizados conforme reprocessados` });
        }

        // Coleta placas vistas neste run para limpar entradas obsoletas após scan completo
        const placasSGAvisitadas = new Set<string>();

        function persistirParcial(status: 'em_progresso' | 'erro') {
          try {
            const lista = Array.from(mapaResultados.values());
            salvarCacheSemPontuar({
              total: lista.length,
              veiculos: lista,
              gerado_em: new Date().toISOString(),
              dias_filtro: diasFiltro,
              situacoes_filtro: codigosFinal,
              status,
              verificados: totalVerificadosRDV,
              total_alvo: totalSGA,
            });
          } catch { /* noop */ }
        }

        for (const codigoSituacao of codigosFinal) {
          send({ tipo: 'log', msg: `Buscando veículos da situação ${codigoSituacao} no SGA...` });

          let inicio = 0;
          let paginaNum = 0;

          while (true) {
            paginaNum++;
            const raw = await sgaRequestRaw('listar/veiculo', {
              method: 'POST',
              body: JSON.stringify({
                codigo_situacao: codigoSituacao,
                inicio_paginacao: inicio,
                quantidade_por_pagina: PAGE_SIZE,
              }),
            }) as SGAListarVeiculoResponse;

            if (raw.error) {
              const errMsg = raw.error.join(' ').toLowerCase();
              const isEmpty = errMsg.includes('não foram encontrados') || errMsg.includes('nao foram encontrados');
              if (isEmpty) {
                send({ tipo: 'log', msg: `Situação ${codigoSituacao}: sem veículos (ignorada)` });
                break; // próxima situação
              }
              send({ tipo: 'aviso', msg: `Situação ${codigoSituacao} falhou: ${raw.mensagem || ''} — ${raw.error.join(', ')} (continuando)` });
              break;
            }

            const pagina: SGAVeiculo[] = raw.veiculos || [];
            if (paginaNum === 1 && raw.total_veiculos) {
              totalSGA += raw.total_veiculos;
              send({ tipo: 'log', msg: `Situação ${codigoSituacao}: ${raw.total_veiculos} veículos encontrados` });
            }

            if (pagina.length === 0) break;

            // Marca placas vistas no SGA
            for (const v of pagina) {
              const k = (v.placa || v.chassi || '').toUpperCase().trim();
              if (k) placasSGAvisitadas.add(k);
            }

            // Processar em batches com RDV
            for (let i = 0; i < pagina.length; i += RDV_BATCH) {
              const batch = pagina.slice(i, i + RDV_BATCH);

              const checagens = await Promise.allSettled(
                batch.map(async (v) => {
                  const k = (v.placa || v.chassi || '').toUpperCase().trim();
                  if (!k) return { chave: '', resultado: null };
                  const cpf = v.cpf_associado || undefined;
                  const posicao = await obterUltimaPosicaoComCache(v.placa || undefined, v.chassi || undefined, cpf);

                  // Veículo não existe na RDV — não é caso "sem pontuar"
                  if (!posicao.existe) return { chave: k, resultado: null };

                  if (!primeiraResposta && posicao.rawResponse) {
                    primeiraResposta = posicao.rawResponse;
                    send({ tipo: 'log', msg: `Campos da resposta RDV: ${Object.keys(primeiraResposta).join(', ')}` });
                  }

                  let diasSemPontuar: number | null = null;
                  let ultimaPontuacao: string | null = null;

                  if (posicao.dataHora) {
                    diasSemPontuar = Math.floor((Date.now() - posicao.dataHora.getTime()) / (1000 * 60 * 60 * 24));
                    ultimaPontuacao = posicao.dataHora.toISOString();
                  }

                  // Filtro server-side: excluir veículos com pontuação recente
                  if (diasSemPontuar === null || diasSemPontuar < diasFiltro) return { chave: k, resultado: null };

                  const item: VeiculoSemPontuar = {
                    placa: v.placa || '',
                    chassi: v.chassi || '',
                    modelo: v.modelo || '',
                    marca: v.marca || '',
                    tipo_veiculo: v.tipo || v.tipo_veiculo || String(v.codigo_tipo || ''),
                    situacao_sga: mapaSituacoes.get(codigoSituacao) || v.situacao || String(codigoSituacao),
                    ultima_pontuacao: ultimaPontuacao,
                    dias_sem_pontuar: diasSemPontuar,
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

              totalVerificadosRDV += batch.length;
            }

            send({
              tipo: 'rdv_progresso',
              verificados: totalVerificadosRDV,
              total: totalSGA || totalVerificadosRDV,
              encontrados: mapaResultados.size,
            });

            // Persistir parcial a cada página (segura contra crash/reload)
            persistirParcial('em_progresso');

            inicio += pagina.length;
            if (pagina.length < PAGE_SIZE) break;
          }
        }

        // Após scan completo: remove entradas que não aparecem mais no SGA
        let removidosForaSGA = 0;
        for (const k of Array.from(mapaResultados.keys())) {
          if (!placasSGAvisitadas.has(k)) { mapaResultados.delete(k); removidosForaSGA++; }
        }
        if (removidosForaSGA > 0) {
          send({ tipo: 'log', msg: `Removidas ${removidosForaSGA} entrada(s) que saíram do SGA` });
        }

        send({ tipo: 'log', msg: `Concluído — ${totalVerificadosRDV} verificado(s) na RDV, ${mapaResultados.size} sem atualização há ${diasFiltro}+ dias` });

        const gerado_em = new Date().toISOString();
        const resultado = Array.from(mapaResultados.values());
        salvarCacheSemPontuar({
          total: resultado.length,
          veiculos: resultado,
          gerado_em,
          dias_filtro: diasFiltro,
          situacoes_filtro: codigosFinal,
          status: 'concluido',
          verificados: totalVerificadosRDV,
          total_alvo: totalSGA,
        });

        send({
          tipo: 'concluido',
          total: resultado.length,
          veiculos: resultado,
          gerado_em,
          dias_filtro: diasFiltro,
          situacoes_filtro: codigosFinal,
        });

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
