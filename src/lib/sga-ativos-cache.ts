import fs from 'fs';
import path from 'path';
import { listarSituacoesVeiculo, sgaRequestRaw } from './sga';
import { SGAVeiculo } from '@/types';

const ARQUIVO = path.join(process.cwd(), 'data', 'cache-sga-ativos.json');
const TTL_MS = 30 * 60 * 1000; // 30 minutos
const PAGE_SIZE = 1000;

export interface CacheSGAAtivos {
  veiculos: SGAVeiculo[];
  codigo_situacao_ativo: number;
  nome_situacao_ativo: string;
  gerado_em: string;
  total: number;
}

interface SGAListarResponse {
  mensagem?: string;
  total_veiculos?: number;
  veiculos?: SGAVeiculo[];
  error?: string[];
}

function lerCache(): CacheSGAAtivos | null {
  try {
    if (!fs.existsSync(ARQUIVO)) return null;
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8')) as CacheSGAAtivos;
    if (!dados.gerado_em || !Array.isArray(dados.veiculos)) return null;
    if (Date.now() - new Date(dados.gerado_em).getTime() > TTL_MS) return null;
    return dados;
  } catch { return null; }
}

function salvarCache(dados: CacheSGAAtivos): void {
  try {
    fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    fs.writeFileSync(ARQUIVO, JSON.stringify(dados));
  } catch { /* noop */ }
}

let fetchingPromise: Promise<CacheSGAAtivos> | null = null;

async function fetchAtivos(onProgresso?: (carregados: number, total: number) => void): Promise<CacheSGAAtivos> {
  const todasSituacoes = await listarSituacoesVeiculo();
  const situacaoAtiva = todasSituacoes.find(s =>
    (s.descricao_situacao || s.situacao || '').toUpperCase() === 'ATIVO'
  );
  if (!situacaoAtiva) throw new Error('Situação "ATIVO" não encontrada no SGA');

  const codigoAtivo = Number(situacaoAtiva.codigo_situacao);
  const nomeAtivo = situacaoAtiva.descricao_situacao || situacaoAtiva.situacao || 'ATIVO';
  const veiculos: SGAVeiculo[] = [];
  let inicio = 0;
  let totalSGA = 0;

  while (true) {
    const raw = await sgaRequestRaw('listar/veiculo', {
      method: 'POST',
      body: JSON.stringify({
        codigo_situacao: codigoAtivo,
        inicio_paginacao: inicio,
        quantidade_por_pagina: PAGE_SIZE,
      }),
    }) as SGAListarResponse;

    if (raw.error) {
      const errMsg = raw.error.join(' ').toLowerCase();
      if (errMsg.includes('não foram encontrados') || errMsg.includes('nao foram encontrados')) break;
      throw new Error(`SGA: ${raw.mensagem || ''} — ${raw.error.join(', ')}`);
    }

    const pagina = raw.veiculos || [];
    if (inicio === 0 && raw.total_veiculos) totalSGA = raw.total_veiculos;
    veiculos.push(...pagina);
    if (onProgresso) onProgresso(veiculos.length, totalSGA || veiculos.length);
    inicio += pagina.length;
    if (pagina.length < PAGE_SIZE) break;
  }

  const dados: CacheSGAAtivos = {
    veiculos,
    codigo_situacao_ativo: codigoAtivo,
    nome_situacao_ativo: nomeAtivo,
    gerado_em: new Date().toISOString(),
    total: veiculos.length,
  };
  salvarCache(dados);
  return dados;
}

export async function obterVeiculosAtivos(
  onProgresso?: (carregados: number, total: number) => void
): Promise<CacheSGAAtivos> {
  const cached = lerCache();
  if (cached) return cached;

  if (!fetchingPromise) {
    fetchingPromise = fetchAtivos(onProgresso).finally(() => { fetchingPromise = null; });
  }
  return fetchingPromise;
}
