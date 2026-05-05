import fs from 'fs';
import path from 'path';
import {
  obterStatusVeiculo as obterStatusOriginal,
  obterUltimaPosicaoValida as obterPosicaoOriginal,
  type StatusVeiculo,
  type UltimaPosicao,
} from './rdv';
import { consultarRdvLocal, rdvLocalDisponivel } from './rdv-local';

// Registro persistido por veículo (chave = placa, fallback chassi).
interface RegistroVeiculoRDV {
  status?: { existe: boolean; ativo: boolean; dataInativo?: string };
  status_em?: string;
  posicao?: { existe: boolean; dataHora?: string }; // ISO string
  posicao_em?: string;
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'cache-rdv.json');

const TTL_STATUS_MS = 24 * 60 * 60 * 1000; // 24h
const TTL_POSICAO_MS = 12 * 60 * 60 * 1000; // 12h
const FLUSH_A_CADA_N_MISSES = 100;

let cache: Map<string, RegistroVeiculoRDV> | null = null;
let missesDesdeUltimoFlush = 0;

function carregar(): Map<string, RegistroVeiculoRDV> {
  if (cache !== null) return cache;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as Record<string, RegistroVeiculoRDV>;
      cache = new Map(Object.entries(data));
    } else {
      cache = new Map();
    }
  } catch {
    cache = new Map();
  }
  return cache;
}

function chave(placa?: string, chassi?: string): string {
  return ((placa || chassi || '').toUpperCase()).trim();
}

export function flushCacheRDV(): void {
  if (!cache) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const obj = Object.fromEntries(cache);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
  missesDesdeUltimoFlush = 0;
}

function marcarMiss() {
  missesDesdeUltimoFlush++;
  if (missesDesdeUltimoFlush >= FLUSH_A_CADA_N_MISSES) flushCacheRDV();
}

export interface StatsCacheRDV {
  tamanho: number;
  com_status: number;
  com_posicao: number;
  status_validos: number; // dentro do TTL
  posicao_validas: number;
}

export function statsCacheRDV(): StatsCacheRDV {
  const c = carregar();
  const agora = Date.now();
  let cs = 0, cp = 0, sv = 0, pv = 0;
  for (const r of c.values()) {
    if (r.status) {
      cs++;
      if (r.status_em && agora - new Date(r.status_em).getTime() < TTL_STATUS_MS) sv++;
    }
    if (r.posicao) {
      cp++;
      if (r.posicao_em && agora - new Date(r.posicao_em).getTime() < TTL_POSICAO_MS) pv++;
    }
  }
  return { tamanho: c.size, com_status: cs, com_posicao: cp, status_validos: sv, posicao_validas: pv };
}

export async function obterStatusVeiculoComCache(
  placa?: string,
  chassi?: string,
  cpfCnpjCliente?: string,
  ttlMs = TTL_STATUS_MS,
): Promise<StatusVeiculo> {
  const k = chave(placa, chassi);
  if (!k) return obterStatusOriginal(placa, chassi, cpfCnpjCliente);

  // 1. Consultar relatório local da RDV (se disponível) — sem chamada de API
  const local = consultarRdvLocal(placa, chassi);
  if (local.encontrado) {
    return { existe: true, ativo: !local.veiculo!.bloqueio };
  }
  // Se o arquivo local está disponível e o veículo não foi encontrado → não tem rastreador
  if (rdvLocalDisponivel()) {
    return { existe: false, ativo: false };
  }

  // 2. Checar cache persistido em disco
  const c = carregar();
  const reg = c.get(k);
  const agora = Date.now();
  if (reg?.status && reg.status_em && agora - new Date(reg.status_em).getTime() < ttlMs) {
    return { ...reg.status };
  }

  // 3. Fallback: chamar API RDV (somente quando arquivo local não está disponível)
  const status = await obterStatusOriginal(placa, chassi, cpfCnpjCliente);
  c.set(k, {
    ...reg,
    status: { existe: status.existe, ativo: status.ativo, dataInativo: status.dataInativo },
    status_em: new Date().toISOString(),
  });
  marcarMiss();
  return status;
}

export async function obterUltimaPosicaoComCache(
  placa?: string,
  chassi?: string,
  cpfCnpjCliente?: string,
  ttlMs = TTL_POSICAO_MS,
): Promise<UltimaPosicao> {
  const k = chave(placa, chassi);
  if (!k) return obterPosicaoOriginal(placa, chassi, cpfCnpjCliente);

  // 1. Consultar relatório local da RDV (se disponível)
  const local = consultarRdvLocal(placa, chassi);
  if (local.encontrado) {
    const v = local.veiculo!;
    return {
      existe: true,
      dataHora: v.ultimaConexao ? new Date(v.ultimaConexao) : undefined,
    };
  }
  // Se o arquivo local está disponível e o veículo não foi encontrado → não tem rastreador
  if (rdvLocalDisponivel()) {
    return { existe: false };
  }

  // 2. Checar cache persistido em disco
  const c = carregar();
  const reg = c.get(k);
  const agora = Date.now();
  if (reg?.posicao && reg.posicao_em && agora - new Date(reg.posicao_em).getTime() < ttlMs) {
    return {
      existe: reg.posicao.existe,
      dataHora: reg.posicao.dataHora ? new Date(reg.posicao.dataHora) : undefined,
    };
  }

  // 3. Fallback: chamar API RDV
  const posicao = await obterPosicaoOriginal(placa, chassi, cpfCnpjCliente);
  c.set(k, {
    ...reg,
    posicao: {
      existe: posicao.existe,
      dataHora: posicao.dataHora ? posicao.dataHora.toISOString() : undefined,
    },
    posicao_em: new Date().toISOString(),
  });
  marcarMiss();
  return posicao;
}
