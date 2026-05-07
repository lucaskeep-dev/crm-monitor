import { RdvAbortError } from '@/lib/rdv';
import { obterStatusVeiculoComCache, flushCacheRDV, statsCacheRDV } from '@/lib/cache-rdv';
import { listarRegras, regraSeAplica, salvarCacheAusentes, lerCacheAusentes } from '@/lib/storage';
import { obterVeiculosAtivos } from '@/lib/sga-ativos-cache';
import { VeiculoAusenteRDV } from '@/types';

export const maxDuration = 300;

const RDV_BATCH = 15;
const PERSIST_A_CADA = 150; // candidatos verificados entre cada persist parcial

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

        send({ tipo: 'log', msg: 'Lendo regras FIPE cadastradas...' });
        const regrasAtivas = listarRegras().filter(r => r.ativo);

        if (regrasAtivas.length === 0) {
          send({ tipo: 'erro', msg: 'Nenhuma regra FIPE ativa. Acesse "Regras FIPE" para configurar.' });
          controller.close();
          return;
        }

        const totalTipos = regrasAtivas.reduce((acc, r) => acc + r.tipos.length, 0);
        send({ tipo: 'log', msg: `${regrasAtivas.length} regra(s) ativa(s) cobrindo ${totalTipos} tipo(s) de veículo` });

        // Carrega lista de ATIVO do SGA — compartilhada com Sem Pontuar (TTL 30 min)
        send({ tipo: 'log', msg: 'Carregando veículos ativos do SGA (cache compartilhado)...' });
        let ultimoProgresso = 0;
        const { veiculos: todosVeiculos, codigo_situacao_ativo, nome_situacao_ativo, total: totalSGA } =
          await obterVeiculosAtivos((carregados, total) => {
            // Só reporta a cada 1000 para não inundar o stream
            if (carregados - ultimoProgresso >= 1000 || carregados === total) {
              send({ tipo: 'log', msg: `SGA: ${carregados}/${total} veículos carregados...` });
              ultimoProgresso = carregados;
            }
          });

        send({ tipo: 'log', msg: `${totalSGA} veículos ativos (situação: ${nome_situacao_ativo}, código ${codigo_situacao_ativo})` });

        // Marca todas as placas como visitadas no SGA ativo
        const placasSGAativo = new Set<string>();
        for (const v of todosVeiculos) {
          const k = (v.placa || v.chassi || '').toUpperCase().trim();
          if (k) placasSGAativo.add(k);
        }

        // Filtra candidatos pelas regras FIPE
        const candidatos = todosVeiculos.filter(v => {
          const codigoTipo = Number(v.codigo_tipo || v.codigo_tipo_veiculo || 0);
          const valorFipe = Number(v.valor_fipe || 0);
          const codigoClassificacao = Number(v.codigo_classificacao || 0);
          return regrasAtivas.some(r => regraSeAplica(r, codigoTipo, valorFipe, codigoClassificacao));
        });

        send({ tipo: 'log', msg: `${candidatos.length} candidato(s) passam pelas regras FIPE — verificando na RDV...` });

        // Carrega cache anterior
        const cacheAnterior = lerCacheAusentes();
        const mapaResultados = new Map<string, VeiculoAusenteRDV>();
        if (cacheAnterior?.veiculos) {
          for (const v of cacheAnterior.veiculos) {
            const k = (v.placa || v.chassi || '').toUpperCase().trim();
            if (k) mapaResultados.set(k, v);
          }
        }
        if (mapaResultados.size > 0) {
          send({ tipo: 'log', msg: `Cache anterior: ${mapaResultados.size} ausentes preservados` });
        }

        function persistirParcial(status: 'em_progresso' | 'erro') {
          try {
            const lista = Array.from(mapaResultados.values());
            salvarCacheAusentes({
              total: lista.length,
              veiculos: lista,
              gerado_em: new Date().toISOString(),
              status,
              verificados: candidatos.length,
              total_alvo: totalSGA,
            });
          } catch { /* noop */ }
        }

        let candidatosVerificados = 0;

        for (let i = 0; i < candidatos.length; i += RDV_BATCH) {
          const batch = candidatos.slice(i, i + RDV_BATCH);

          const checagens = await Promise.allSettled(
            batch.map(async (v) => {
              const k = (v.placa || v.chassi || '').toUpperCase().trim();
              if (!k) return { chave: '', resultado: null };

              const statusRDV = await obterStatusVeiculoComCache(v.placa || undefined, v.chassi || undefined);
              if (statusRDV.existe) return { chave: k, resultado: null };

              const codigoTipo = Number(v.codigo_tipo || v.codigo_tipo_veiculo || 0);
              const valorFipe = Number(v.valor_fipe || 0);

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

          candidatosVerificados += batch.length;

          send({
            tipo: 'rdv_progresso',
            verificados: candidatosVerificados,
            total: candidatos.length,
            encontrados: mapaResultados.size,
          });

          if (candidatosVerificados % PERSIST_A_CADA < RDV_BATCH) {
            persistirParcial('em_progresso');
          }
        }

        // Remove entradas que saíram do SGA ativo
        let removidosForaSGA = 0;
        for (const k of Array.from(mapaResultados.keys())) {
          if (!placasSGAativo.has(k)) { mapaResultados.delete(k); removidosForaSGA++; }
        }
        if (removidosForaSGA > 0) {
          send({ tipo: 'log', msg: `Removidas ${removidosForaSGA} entrada(s) que saíram do SGA ativo` });
        }

        send({ tipo: 'log', msg: `Concluído — ${candidatosVerificados} candidato(s) verificado(s), ${mapaResultados.size} sem rastreador` });

        const gerado_em = new Date().toISOString();
        const resultado = Array.from(mapaResultados.values());
        salvarCacheAusentes({
          total: resultado.length,
          veiculos: resultado,
          gerado_em,
          status: 'concluido',
          verificados: candidatosVerificados,
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
