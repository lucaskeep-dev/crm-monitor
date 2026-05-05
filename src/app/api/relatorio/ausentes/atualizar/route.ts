import { NextResponse } from 'next/server';
import { RdvAbortError } from '@/lib/rdv';
import { obterStatusVeiculoComCache, flushCacheRDV } from '@/lib/cache-rdv';
import { lerCacheAusentes, salvarCacheAusentes } from '@/lib/storage';

export const maxDuration = 300;

const lockKey = '__ausentes_atualizar_running';
function isRunning(): boolean { return Boolean((globalThis as Record<string, unknown>)[lockKey]); }
function setRunning(v: boolean) { (globalThis as Record<string, unknown>)[lockKey] = v; }

const BATCH = 15;

export async function GET() {
  if (isRunning()) {
    return NextResponse.json({ ok: false, msg: 'já em execução' });
  }
  setRunning(true);

  try {
    const cache = lerCacheAusentes();
    if (!cache?.veiculos?.length) {
      return NextResponse.json({ ok: true, msg: 'cache vazio — nada a atualizar' });
    }

    const veiculos = [...cache.veiculos];
    const mapa = new Map(veiculos.map(v => [(v.placa || v.chassi || '').toUpperCase().trim(), v]));
    let verificados = 0;

    salvarCacheAusentes({ ...cache, status: 'em_progresso', verificados: 0, total_alvo: veiculos.length });

    for (let i = 0; i < veiculos.length; i += BATCH) {
      const batch = veiculos.slice(i, i + BATCH);

      const checagens = await Promise.allSettled(
        batch.map(async (v) => {
          const k = (v.placa || v.chassi || '').toUpperCase().trim();
          if (!k) return { chave: k, remover: false };
          const statusRDV = await obterStatusVeiculoComCache(v.placa || undefined, v.chassi || undefined);
          // Veículo ausente = não está na RDV. Se agora está → remove da lista
          return { chave: k, remover: statusRDV.existe };
        })
      );

      for (const r of checagens) {
        if (r.status === 'rejected' && r.reason instanceof RdvAbortError) {
          const lista = Array.from(mapa.values());
          salvarCacheAusentes({ ...cache, veiculos: lista, total: lista.length, verificados, total_alvo: veiculos.length, status: 'erro', gerado_em: new Date().toISOString() });
          throw r.reason;
        }
        if (r.status === 'fulfilled' && r.value.chave) {
          if (r.value.remover) mapa.delete(r.value.chave);
        }
      }

      verificados += batch.length;

      if (verificados % 150 === 0 || verificados === veiculos.length) {
        const lista = Array.from(mapa.values());
        salvarCacheAusentes({ ...cache, veiculos: lista, total: lista.length, verificados, total_alvo: veiculos.length, status: 'em_progresso', gerado_em: new Date().toISOString() });
      }
    }

    const resultado = Array.from(mapa.values());
    salvarCacheAusentes({
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
