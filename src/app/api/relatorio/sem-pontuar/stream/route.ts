import { NextRequest } from 'next/server';
import { RdvAbortError } from '@/lib/rdv';
import { obterUltimaPosicaoComCache, flushCacheRDV, statsCacheRDV } from '@/lib/cache-rdv';
import { salvarCacheSemPontuar, lerCacheSemPontuar } from '@/lib/storage';
import { obterVeiculosAtivos } from '@/lib/sga-ativos-cache';
import { VeiculoSemPontuar } from '@/types';

export const maxDuration = 300;

const RDV_BATCH = 10;
const PERSIST_A_CADA = 100;

const lockKey = '__sem_pontuar_stream_running';
function isRunning(): boolean { return Boolean((globalThis as Record<string, unknown>)[lockKey]); }
function setRunning(v: boolean) { (globalThis as Record<string, unknown>)[lockKey] = v; }

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const diasFiltro = Number(searchParams.get('dias') || '30');

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

        // Carrega lista de ATIVO do SGA — compartilhada com Sem Rastreador (TTL 30 min)
        send({ tipo: 'log', msg: 'Carregando veículos ativos do SGA (cache compartilhado)...' });
        let ultimoProgresso = 0;
        const { veiculos: todosVeiculos, codigo_situacao_ativo, nome_situacao_ativo, total: totalSGA } =
          await obterVeiculosAtivos((carregados, total) => {
            if (carregados - ultimoProgresso >= 1000 || carregados === total) {
              send({ tipo: 'log', msg: `SGA: ${carregados}/${total} veículos carregados...` });
              ultimoProgresso = carregados;
            }
          });

        send({ tipo: 'log', msg: `${totalSGA} veículos ativos (situação: ${nome_situacao_ativo}, código ${codigo_situacao_ativo})` });

        const codigosFinal = [codigo_situacao_ativo];

        // Carrega cache anterior
        const cacheAnterior = lerCacheSemPontuar();
        const mapaResultados = new Map<string, VeiculoSemPontuar>();
        if (cacheAnterior?.veiculos) {
          for (const v of cacheAnterior.veiculos) {
            const k = (v.placa || v.chassi || '').toUpperCase().trim();
            if (k && (v.dias_sem_pontuar ?? 0) >= diasFiltro) mapaResultados.set(k, v);
          }
        }
        if (mapaResultados.size > 0) {
          send({ tipo: 'log', msg: `Cache anterior: ${mapaResultados.size} sem-pontuar preservados` });
        }

        // Coleta placas visitadas para limpar obsoletos
        const placasSGAvisitadas = new Set<string>();
        for (const v of todosVeiculos) {
          const k = (v.placa || v.chassi || '').toUpperCase().trim();
          if (k) placasSGAvisitadas.add(k);
        }

        let primeiraResposta: Record<string, unknown> | null = null;
        let totalVerificadosRDV = 0;

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

        for (let i = 0; i < todosVeiculos.length; i += RDV_BATCH) {
          const batch = todosVeiculos.slice(i, i + RDV_BATCH);

          const checagens = await Promise.allSettled(
            batch.map(async (v) => {
              const k = (v.placa || v.chassi || '').toUpperCase().trim();
              if (!k) return { chave: '', resultado: null };

              const posicao = await obterUltimaPosicaoComCache(v.placa || undefined, v.chassi || undefined);
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

              // null = nunca conectou ao rastreador → inclui sempre
              if (diasSemPontuar !== null && diasSemPontuar < diasFiltro) return { chave: k, resultado: null };

              const item: VeiculoSemPontuar = {
                placa: v.placa || '',
                chassi: v.chassi || '',
                modelo: v.modelo || '',
                marca: v.marca || '',
                tipo_veiculo: v.tipo || v.tipo_veiculo || String(v.codigo_tipo || ''),
                situacao_sga: nome_situacao_ativo,
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

          send({
            tipo: 'rdv_progresso',
            verificados: totalVerificadosRDV,
            total: totalSGA,
            encontrados: mapaResultados.size,
          });

          if (totalVerificadosRDV % PERSIST_A_CADA < RDV_BATCH) {
            persistirParcial('em_progresso');
          }
        }

        // Remove entradas que não aparecem mais no SGA
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
