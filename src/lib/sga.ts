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

export async function buscarUltimoPagamento(placaOuChassi: string): Promise<Date | null> {
  const JANELA = 200;
  const MAX_JANELAS = 6; // até 1200 dias (~3 anos) para trás
  const hoje = new Date();

  for (let i = 0; i < MAX_JANELAS; i++) {
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() - i * JANELA);
    const inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - JANELA);

    try {
      const data = await sgaRequest<unknown[]>('listar/boleto-associado-veiculo', {
        method: 'POST',
        body: JSON.stringify({
          placa: placaOuChassi, // SGA aceita placa ou chassi neste campo
          data_pagamento_inicial: formatarData(inicio),
          data_pagamento_final: formatarData(fim),
        }),
      });

      if (!Array.isArray(data) || data.length === 0) continue;

      const pagos = data
        .filter((b: unknown) => {
          const boleto = b as { data_pagamento?: string; situacao_boleto?: string };
          return boleto.data_pagamento && boleto.data_pagamento !== '0000-00-00' && boleto.situacao_boleto === 'BAIXADO';
        })
        .map((b: unknown) => new Date((b as { data_pagamento: string }).data_pagamento))
        .filter((d: Date) => !isNaN(d.getTime()));

      if (pagos.length > 0) {
        return pagos.reduce((a: Date, b: Date) => (b > a ? b : a));
      }
    } catch {
      continue;
    }
  }
  return null;
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
