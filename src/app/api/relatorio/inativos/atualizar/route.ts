import { NextResponse } from 'next/server';
import { RdvAbortError } from '@/lib/rdv';
import { obterStatusVeiculoComCache, flushCacheRDV } from '@/lib/cache-rdv';
import { lerCacheInativos, salvarCacheInativos } from '@/lib/storage';
import { buscarUltimoPagamento } from '@/lib/sga';
import { VeiculoInativoRDV } from '@/types';

export const maxDuration = 300;

const lockKey = '__inativos_atualizar_running';
function isRunning(): boolean { return Boolean((globalThis as Record<string, unknown>)[lockKey]); }
function setRunning(v: boolean) { (globalThis as Record<string, unknown>)[lockKey] = v; }

const BATCH = 10;

function diasDesde(data: Date): number {
  return Math.floor((Date.now() - data.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET() {
  if (isRunning()) {
    return NextResponse.json({ ok: false, msg: 'já em execução' });
  }
  setRunning(true);

  try {
    const cache = lerCacheInativos();
    if (!cache?.veiculos?.length) {
      return NextResponse.json({ ok: true, msg: 'cache vazio — nada a atualizar' });
    }

    const veiculos = [...cache.veiculos];
    const mapa = new Map(veiculos.map(v => [(v.placa || v.chassi || '').toUpperCase().trim(), v]));
    let verificados = 0;

    salvarCacheInativos({ ...cache, status: 'em_progresso', verificados: 0, total_alvo: veiculos.length });

    for (let i = 0; i < veiculos.length; i += BATCH) {
      const batch = veiculos.slice(i, i + BATCH);

      const checagens = await Promise.allSettled(
        batch.map(async (v) => {
          const k = (v.placa || v.chassi || '').toUpperCase().trim();
          if (!k) return { chave: k, resultado: null as VeiculoInativoRDV | null };

          const statusRDV = await obterStatusVeiculoComCache(v.placa || undefined, v.chassi || undefined);
          if (!statusRDV.existe) return { chave: k, resultado: null };

          // Recalcula dias_inativo: usa placa ou chassi para buscar último pagamento
          const identificador = v.placa || v.chassi;
          const ultimoPagamento = identificador ? await buscarUltimoPagamento(identificador) : null;

          let dataBase: Date | null = ultimoPagamento;
          if (!dataBase && v.data_contrato) {
            // Tenta data_contrato como ISO — pode ser data_contrato_final se foi reescrito
            const d = new Date(v.data_contrato);
            if (!isNaN(d.getTime())) dataBase = d;
          }

          const dias = dataBase ? diasDesde(dataBase) : v.dias_inativo;
          const dataInativo = dataBase ? dataBase.toISOString() : v.data_contrato;

          return {
            chave: k,
            resultado: {
              ...v,
              data_contrato: dataInativo,
              dias_inativo: dias,
              status_rdv: statusRDV.ativo ? 'Ativo na RDV' : 'Inativo na RDV',
            } as VeiculoInativoRDV,
          };
        })
      );

      for (const r of checagens) {
        if (r.status === 'rejected' && r.reason instanceof RdvAbortError) {
          const lista = Array.from(mapa.values());
          salvarCacheInativos({ ...cache, veiculos: lista, total: lista.length, verificados, total_alvo: veiculos.length, status: 'erro', gerado_em: new Date().toISOString() });
          throw r.reason;
        }
        if (r.status === 'fulfilled' && r.value.chave) {
          const { chave, resultado } = r.value;
          if (resultado) mapa.set(chave, resultado);
          else mapa.delete(chave);
        }
      }

      verificados += batch.length;

      if (verificados % 100 === 0 || verificados === veiculos.length) {
        const lista = Array.from(mapa.values());
        salvarCacheInativos({ ...cache, veiculos: lista, total: lista.length, verificados, total_alvo: veiculos.length, status: 'em_progresso', gerado_em: new Date().toISOString() });
      }
    }

    const resultado = Array.from(mapa.values());
    salvarCacheInativos({
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
