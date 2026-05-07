import { consultarRdvLocal } from './rdv-local';
import type { StatusVeiculo, UltimaPosicao } from './rdv';

function chave(placa?: string, chassi?: string): string {
  return ((placa || chassi || '').toUpperCase()).trim();
}

export function flushCacheRDV(): void { /* noop — somente arquivo local */ }

export interface StatsCacheRDV {
  tamanho: number;
  com_status: number;
  com_posicao: number;
  status_validos: number;
  posicao_validas: number;
}

export function statsCacheRDV(): StatsCacheRDV {
  return { tamanho: 0, com_status: 0, com_posicao: 0, status_validos: 0, posicao_validas: 0 };
}

export async function obterStatusVeiculoComCache(
  placa?: string,
  chassi?: string,
): Promise<StatusVeiculo> {
  const k = chave(placa, chassi);
  if (!k) return { existe: false, ativo: false };
  const local = consultarRdvLocal(placa, chassi);
  if (local.encontrado) return { existe: true, ativo: !local.veiculo!.bloqueio };
  return { existe: false, ativo: false };
}

export async function obterUltimaPosicaoComCache(
  placa?: string,
  chassi?: string,
): Promise<UltimaPosicao> {
  const k = chave(placa, chassi);
  if (!k) return { existe: false };
  const local = consultarRdvLocal(placa, chassi);
  if (local.encontrado) {
    const v = local.veiculo!;
    return { existe: true, dataHora: v.ultimaConexao ? new Date(v.ultimaConexao) : undefined };
  }
  return { existe: false };
}
