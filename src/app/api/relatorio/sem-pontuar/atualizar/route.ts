import { NextResponse } from 'next/server';
import { RdvAbortError } from '@/lib/rdv';
import { obterUltimaPosicaoComCache, flushCacheRDV } from '@/lib/cache-rdv';
import { lerCacheSemPontuar, salvarCacheSemPontuar } from '@/lib/storage';
import { VeiculoSemPontuar } from '@/types';

export const maxDuration = 300;

const lockKey = '__sem_pontuar_atualizar_running';
function isRunning(): boolean { return Boolean((globalThis as Record<string, unknown>)[lockKey]); }
function setRunning(v: boolean) { (globalThis as Record<string, unknown>)[lockKey] = v; }

const BATCH = 15;

export async function GET(request: Request) {
  if (isRunning()) {
    return NextResponse.json({ ok: false, msg: 'já em execução' });
  }
  setRunning(true);

  try {
    const cache = lerCacheSemPontuar();
    if (!cache?.veiculos?.length) {
      return NextResponse.json({ ok: true, msg: 'cache vazio — nada a atualizar' });
    }

    const diasFiltro = cache.dias_filtro ?? 30;
    const veiculos = [...cache.veiculos];
    const mapa = new Map(veiculos.map(v => [(v.placa || v.chassi || '').toUpperCase().trim(), v]));
    let verificados = 0;

    salvarCacheSemPontuar({ ...cache, status: 'em_progresso', verificados: 0, total_alvo: veiculos.length });

    for (let i = 0; i < veiculos.length; i += BATCH) {
      const batch = veiculos.slice(i, i + BATCH);

      const checagens = await Promise.allSettled(
        batch.map(async (v) => {
          const k = (v.placa || v.chassi || '').toUpperCase().trim();
          if (!k) return { chave: k, resultado: null as VeiculoSemPontuar | null };
          const posicao = await obterUltimaPosicaoComCache(v.placa || undefined, v.chassi || undefined);

          if (!posicao.existe) return { chave: k, resultado: null };

          let diasSemPontuar: number | null = null;
          let ultimaPontuacao: string | null = null;
          if (posicao.dataHora) {
            diasSemPontuar = Math.floor((Date.now() - posicao.dataHora.getTime()) / (1000 * 60 * 60 * 24));
            ultimaPontuacao = posicao.dataHora.toISOString();
          }

          // Saiu do filtro (pontuou recentemente) → remove
          if (diasSemPontuar === null || diasSemPontuar < diasFiltro) return { chave: k, resultado: null };

          return { chave: k, resultado: { ...v, dias_sem_pontuar: diasSemPontuar, ultima_pontuacao: ultimaPontuacao } as VeiculoSemPontuar };
        })
      );

      for (const r of checagens) {
        if (r.status === 'rejected' && r.reason instanceof RdvAbortError) {
          const lista = Array.from(mapa.values());
          salvarCacheSemPontuar({ ...cache, veiculos: lista, total: lista.length, verificados, total_alvo: veiculos.length, status: 'erro', gerado_em: new Date().toISOString() });
          throw r.reason;
        }
        if (r.status === 'fulfilled' && r.value.chave) {
          const { chave, resultado } = r.value;
          if (resultado) mapa.set(chave, resultado);
          else mapa.delete(chave);
        }
      }

      verificados += batch.length;

      if (verificados % 150 === 0 || verificados === veiculos.length) {
        const lista = Array.from(mapa.values());
        salvarCacheSemPontuar({ ...cache, veiculos: lista, total: lista.length, verificados, total_alvo: veiculos.length, status: 'em_progresso', gerado_em: new Date().toISOString() });
      }
    }

    const resultado = Array.from(mapa.values());
    salvarCacheSemPontuar({
      ...cache,
      veiculos: resultado,
      total: resultado.length,
      verificados,
      total_alvo: veiculos.length,
      status: 'concluido',
      gerado_em: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, verificados, mantidos: resultado.length, removidos: veiculos.length - resultado.length });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 });
  } finally {
    try { flushCacheRDV(); } catch { /* noop */ }
    setRunning(false);
  }
}
