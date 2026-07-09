import { SGAVeiculo, SGASituacaoVeiculo, SGATipoVeiculo, SGAClassificacaoVeiculo, SGAVeiculoCompleto } from '@/types';

const BASE_URL = process.env.SGA_BASE_URL!;
const API_KEY = process.env.SGA_API_KEY!;
const USUARIO = process.env.SGA_USUARIO!;
const SENHA = process.env.SGA_SENHA!;

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

export async function autenticarSGA(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const response = await fetch(`${BASE_URL}/usuario/autenticar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ usuario: USUARIO, senha: SENHA }),
  });

  const data = await response.json();

  if (!data.token_usuario) {
    throw new Error(`Falha na autenticação SGA: ${data.mensagem || 'Erro desconhecido'}`);
  }

  cachedToken = data.token_usuario;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  return cachedToken!;
}

export async function sgaRequestRaw(path: string, options: RequestInit = {}): Promise<unknown> {
  return sgaRequest<unknown>(path, options);
}

async function sgaRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await autenticarSGA();

  const response = await fetch(`${BASE_URL}/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    cachedToken = null;
    const newToken = await autenticarSGA();
    const retryResponse = await fetch(`${BASE_URL}/${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${newToken}`,
        ...(options.headers || {}),
      },
    });
    return retryResponse.json();
  }

  return response.json();
}

export async function listarSituacoesVeiculo(): Promise<SGASituacaoVeiculo[]> {
  const data = await sgaRequest<SGASituacaoVeiculo[] | { retorno: SGASituacaoVeiculo[] }>('listar/situacao/todos');
  if (Array.isArray(data)) return data;
  return (data as { retorno: SGASituacaoVeiculo[] }).retorno || [];
}

export async function listarTiposVeiculo(): Promise<SGATipoVeiculo[]> {
  const data = await sgaRequest<SGATipoVeiculo[] | { retorno: SGATipoVeiculo[] }>('listar/tipo-veiculo/ativo');
  if (Array.isArray(data)) return data;
  return (data as { retorno: SGATipoVeiculo[] }).retorno || [];
}

export async function listarClassificacoesVeiculo(): Promise<SGAClassificacaoVeiculo[]> {
  const data = await sgaRequest<SGAClassificacaoVeiculo[] | { retorno: SGAClassificacaoVeiculo[] }>('listar/classificacao-veiculo/ativo');
  if (Array.isArray(data)) return data;
  return (data as { retorno: SGAClassificacaoVeiculo[] }).retorno || [];
}

interface SGAListarVeiculoResponse {
  mensagem?: string;
  total_veiculos?: number;
  numero_paginas?: number;
  pagina_corrente?: number;
  veiculos?: SGAVeiculo[];
  retorno?: SGAVeiculo[];
}

export async function listarVeiculosPorSituacao(
  codigoSituacao: number | string,
  pageSize = 1000,
  onPagina?: (carregados: number, total?: number) => void
): Promise<SGAVeiculo[]> {
  const todos: SGAVeiculo[] = [];
  let inicio = 0;

  while (true) {
    const data = await sgaRequest<SGAListarVeiculoResponse | SGAVeiculo[]>(
      'listar/veiculo',
      {
        method: 'POST',
        body: JSON.stringify({
          codigo_situacao: codigoSituacao,
          inicio_paginacao: inicio,
          quantidade_por_pagina: pageSize,
        }),
      }
    );

    // Se a API retornou erro, verificar se é apenas "resultado vazio" — esse caso é tratado como []
    if (!Array.isArray(data) && (data as SGAListarVeiculoResponse & { error?: string[] }).error) {
      const err = data as SGAListarVeiculoResponse & { mensagem?: string; error?: string[] };
      const errMsg = (err.error?.join(' ') || '').toLowerCase();
      const isEmpty = errMsg.includes('não foram encontrados') || errMsg.includes('nao foram encontrados');
      if (isEmpty) return todos;  // retorna o que já foi carregado (tipicamente [])
      throw new Error(`SGA: ${err.mensagem || ''} — ${err.error?.join(', ') || 'erro desconhecido'}`);
    }

    let pagina: SGAVeiculo[] = [];
    let total: number | undefined;
    if (Array.isArray(data)) {
      pagina = data;
    } else {
      const resp = data as SGAListarVeiculoResponse;
      pagina = resp.veiculos || resp.retorno || [];
      total = resp.total_veiculos;
    }

    todos.push(...pagina);
    onPagina?.(todos.length, total);

    if (pagina.length < pageSize) break;
    inicio += pageSize;
  }

  return todos;
}

export async function buscarVeiculo(placaOuChassi: string): Promise<SGAVeiculo | null> {
  try {
    const data = await sgaRequest<{ retorno?: SGAVeiculo } | SGAVeiculo>(
      `veiculo/buscar/${encodeURIComponent(placaOuChassi)}`
    );
    if (!data) return null;
    if ('retorno' in data) return (data as { retorno?: SGAVeiculo }).retorno || null;
    return data as SGAVeiculo;
  } catch {
    return null;
  }
}

// Buscar veículo COM dados do associado (telefone, email, etc).
// Endpoint: /veiculo/buscar/:placaOuChassi/:buscar_por
// buscarPor: "PLACA" ou "CHASSI" — retorna array com 1 item.
export async function buscarVeiculoCompleto(
  placaOuChassi: string,
  buscarPor: 'PLACA' | 'CHASSI' = 'PLACA'
): Promise<SGAVeiculoCompleto | null> {
  try {
    const data = await sgaRequest<SGAVeiculoCompleto[] | { retorno?: SGAVeiculoCompleto[] } | SGAVeiculoCompleto>(
      `veiculo/buscar/${encodeURIComponent(placaOuChassi)}/${buscarPor}`
    );
    if (!data) return null;
    if (Array.isArray(data)) return data[0] ?? null;
    if ('retorno' in data && Array.isArray(data.retorno)) return data.retorno[0] ?? null;
    return data as SGAVeiculoCompleto;
  } catch {
    return null;
  }
}

function formatarData(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

interface SGABoleto {
  data_pagamento?: string;
  data_vencimento?: string;
  data_emissao?: string;
  tipo_boleto?: string;
  situacao_boleto?: string;
  veiculos?: Array<{ chassi?: string }>;
}

export function parseDataSGA(s?: string | null): Date | null {
  if (!s || s.startsWith('0000-00-00')) return null;
  const d = new Date(s.includes(' ') ? s.replace(' ', 'T') : s);
  return isNaN(d.getTime()) ? null : d;
}

// Taxas de serviço avulsas não representam cobertura (ex.: "DESINSTALAÇÃO DE
// EQUIPAMENTO" R$50 paga meses após o cancelamento zerava o tempo inativo).
const TIPOS_TAXA_SERVICO = ['INSTALA', 'TAXA'];

function ehTaxaServico(b: SGABoleto): boolean {
  const tipo = (b.tipo_boleto || '').toUpperCase();
  return TIPOS_TAXA_SERVICO.some(t => tipo.includes(t));
}

// Data em que o veículo deixou de ter cobertura paga: VENCIMENTO do último boleto
// BAIXADO que não seja taxa de serviço. Usa vencimento (não data de pagamento) pra
// que quitação atrasada de boleto antigo não puxe a data pra frente. Não filtra
// "FECHAMENTO": neste SGA as mensalidades normais são emitidas como carnês desse
// tipo, então ele não discrimina mensalidade de acerto (verificado em 09/07/2026).
export async function buscarFimCobertura(
  placa: string | null | undefined,
  chassi?: string | null,
  codigoAssociado?: number | null,
): Promise<Date | null> {
  const temPlaca = Boolean(placa);
  if (!temPlaca && !codigoAssociado) return null;

  const JANELA = 200;
  const MAX_JANELAS = 6; // até 1200 dias (~3 anos) para trás
  const hoje = new Date();

  for (let i = 0; i < MAX_JANELAS; i++) {
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() - i * JANELA);
    const inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - JANELA);

    try {
      const corpo: Record<string, unknown> = {
        data_pagamento_inicial: formatarData(inicio),
        data_pagamento_final: formatarData(fim),
      };
      if (temPlaca) {
        corpo.placa = placa;
      } else {
        corpo.codigo_associado = codigoAssociado;
      }

      const data = await sgaRequest<SGABoleto[]>('listar/boleto-associado-veiculo', {
        method: 'POST',
        body: JSON.stringify(corpo),
      });

      if (!Array.isArray(data) || data.length === 0) continue;

      // Ao buscar por codigo_associado, manter apenas boletos deste chassi (associado pode ter outros veículos)
      let boletos = data;
      if (!temPlaca && chassi) {
        const chassiUp = chassi.toUpperCase();
        boletos = data.filter(b => b.veiculos?.some(v => v.chassi?.toUpperCase() === chassiUp));
      }

      const vencimentos = boletos
        .filter(b => b.data_pagamento && !b.data_pagamento.startsWith('0000-00-00') && b.situacao_boleto === 'BAIXADO' && !ehTaxaServico(b))
        .map(b => parseDataSGA(b.data_vencimento) ?? parseDataSGA(b.data_pagamento))
        .filter((d): d is Date => d !== null);

      if (vencimentos.length > 0) {
        // Janela mais recente com boleto pago — o maior vencimento dela é o fim da cobertura
        return vencimentos.reduce((a, b) => (b > a ? b : a));
      }
    } catch {
      continue;
    }
  }
  return null;
}

// Início da inatividade pela regra do negócio: o veículo fica inativo quando o boleto
// SEGUINTE ao último vencimento pago deixa de ser pago — ou seja, vencimento + 30 dias.
// Se esse marco ainda está no futuro (pagou há menos de 30 dias), acabou de ficar
// inativo: conta a partir de hoje (0 dias), sem cair nos fallbacks.
export function inicioInatividadePorBoleto(fimCobertura: Date | null): Date | null {
  if (!fimCobertura) return null;
  const inicio = new Date(fimCobertura.getTime() + 30 * 24 * 60 * 60 * 1000);
  return inicio > new Date() ? new Date() : inicio;
}

// Data de alteração do registro no SGA, descartando o mutirão de migração que
// tocou quase todos os registros no mesmo dia (não representa inativação real).
const DATA_MIGRACAO_SGA = '2025-09-29';

export function dataAlteracaoConfiavel(v: { data_alteracao?: string | null }): Date | null {
  const raw = v.data_alteracao;
  if (!raw || raw.startsWith(DATA_MIGRACAO_SGA)) return null;
  return parseDataSGA(raw);
}

// Escolhe a primeira data plausível (válida e não-futura) e devolve dias corridos até hoje
export function escolherDataInativacao(candidatas: Array<Date | null | undefined>): { dataInativo: string | null; dias: number | null } {
  for (const d of candidatas) {
    if (!d || isNaN(d.getTime())) continue;
    const dias = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (dias >= 0) return { dataInativo: d.toISOString(), dias };
  }
  return { dataInativo: null, dias: null };
}

export async function buscarSituacaoVeiculo(placaOuChassi: string): Promise<{ situacao: string; codigo_situacao: number } | null> {
  try {
    const data = await sgaRequest<{ retorno?: { situacao: string; codigo_situacao: number } } | { situacao: string; codigo_situacao: number }>(
      `buscar/situacao-veiculo/${encodeURIComponent(placaOuChassi)}`
    );
    if (!data) return null;
    if ('retorno' in data) return (data as { retorno?: { situacao: string; codigo_situacao: number } }).retorno || null;
    return data as { situacao: string; codigo_situacao: number };
  } catch {
    return null;
  }
}
