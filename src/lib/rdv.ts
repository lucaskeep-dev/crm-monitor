const BASE_URL = process.env.RDV_BASE_URL!;
const TOKEN = process.env.RDV_TOKEN!;

interface RDVResponse {
  error?: string | boolean;
  message?: unknown;
  [key: string]: unknown;
}

// Erros que devem abortar imediatamente o relatório inteiro (não adianta continuar).
export class RdvAbortError extends Error {
  constructor(message: string, public reason: 'blacklist' | 'token' | 'invalid_response') {
    super(message);
    this.name = 'RdvAbortError';
  }
}

// --- Throttle global ---
// A RDV bloqueia o IP (blacklist) acima de 20 req/min.
// Limitamos a 18 req/min com folga de segurança.
const RDV_LIMITE_POR_MINUTO = 50;
const RDV_JANELA_MS = 60_000;
const timestamps: number[] = [];
let cabecalhoFila: Promise<void> = Promise.resolve();

async function obterSlot(): Promise<void> {
  cabecalhoFila = cabecalhoFila.then(async () => {
    while (true) {
      const agora = Date.now();
      while (timestamps.length > 0 && agora - timestamps[0] > RDV_JANELA_MS) {
        timestamps.shift();
      }
      if (timestamps.length < RDV_LIMITE_POR_MINUTO) {
        timestamps.push(agora);
        return;
      }
      const esperar = RDV_JANELA_MS - (agora - timestamps[0]) + 50;
      await new Promise(r => setTimeout(r, esperar));
    }
  });
  return cabecalhoFila;
}

export async function rdvRequestRaw(endpoint: string, jsonBody: Record<string, unknown>): Promise<RDVResponse> {
  return rdvRequest(endpoint, jsonBody);
}

async function rdvRequest(endpoint: string, jsonBody: Record<string, unknown>): Promise<RDVResponse> {
  await obterSlot();

  const params = new URLSearchParams();
  params.append('json', JSON.stringify(jsonBody));

  const response = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const text = await response.text();

  // Tentar parsear JSON; se falhar, examinar o texto para detectar blacklist
  let data: RDVResponse;
  try {
    data = JSON.parse(text) as RDVResponse;
  } catch {
    const lower = text.toLowerCase();
    if (lower.includes('blacklist')) {
      throw new RdvAbortError(
        'IP bloqueado pela RDV (blacklist por excesso de requisições). Aguarde alguns minutos e tente novamente.',
        'blacklist',
      );
    }
    throw new RdvAbortError(
      `Resposta inválida da RDV (HTTP ${response.status}): ${text.slice(0, 200)}`,
      'invalid_response',
    );
  }

  // Detectar erros fatais que devem abortar o relatório
  if (String(data.error) === 'true') {
    const msg = String(data.message || '').toLowerCase();
    if (msg.includes('blacklist')) {
      throw new RdvAbortError(
        'IP bloqueado pela RDV (blacklist por excesso de requisições). Aguarde alguns minutos e tente novamente.',
        'blacklist',
      );
    }
    if (msg.includes('token incorreto') || msg.includes('token inválido') || msg.includes('token invalido')) {
      throw new RdvAbortError(
        'Token RDV inválido. Atualize RDV_TOKEN em .env.local e reinicie o servidor.',
        'token',
      );
    }
  }

  return data;
}

function isRdvError(data: RDVResponse): boolean {
  return String(data.error) === 'true';
}

// Converte "DD/MM/YYYY HH:MM:SS" (formato RDV) para Date
function parseDateRDV(str: string): Date | null {
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (match) {
    const [, dd, mm, yyyy, hh, min, ss] = match;
    const d = new Date(+yyyy, +mm - 1, +dd, +hh, +min, +ss);
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback ISO (com ou sem espaço)
  const d = new Date(str.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

export interface UltimaPosicao {
  existe: boolean;
  dataHora?: Date;
  rawResponse?: Record<string, unknown>;
}

export async function obterUltimaPosicaoValida(
  placa?: string,
  chassi?: string,
  cpfCnpjCliente?: string,
): Promise<UltimaPosicao> {
  const body: Record<string, string> = {};
  if (cpfCnpjCliente) body.cpfCnpjCliente = cpfCnpjCliente;
  if (placa) body.placa = placa;
  if (chassi) body.chassi = chassi;

  const data = await rdvRequest('obterUltimaPosicaoValida/', body);

  if (isRdvError(data)) return { existe: false };

  // Dados ficam dentro de data.message (objeto)
  const payload = (data.message && typeof data.message === 'object')
    ? data.message as Record<string, unknown>
    : data;

  let dataHora: Date | undefined;
  for (const campo of ['dataGPS', 'dataGPRS', 'dataHoraServidor', 'dataHora']) {
    const valor = payload[campo];
    if (typeof valor === 'string' && valor) {
      const dt = parseDateRDV(valor);
      if (dt) { dataHora = dt; break; }
    }
  }

  return { existe: true, dataHora, rawResponse: payload };
}

export interface StatusVeiculo {
  ativo: boolean;
  existe: boolean;
  dataInativo?: string;
  mensagem?: string;
}

export async function obterStatusVeiculo(
  placa?: string,
  chassi?: string,
  cpfCnpjCliente?: string,
): Promise<StatusVeiculo> {
  const body: Record<string, string> = {};
  if (cpfCnpjCliente) body.cpfCnpjCliente = cpfCnpjCliente;
  if (placa) body.placa = placa;
  if (chassi) body.chassi = chassi;

  const data = await rdvRequest('obterStatusVeiculo/', body);

  if (isRdvError(data)) {
    const msg = String(data.message || '').toLowerCase();
    const naoEncontrado = msg.includes('não localizado') || msg.includes('nao localizado') ||
      msg.includes('não encontrado') || msg.includes('nao encontrado') ||
      msg.includes('não cadastrado') || msg.includes('nao cadastrado');
    return { existe: !naoEncontrado, ativo: false };
  }

  // ativo vem como "S" ou "N" (string)
  const ativoRaw = data.ativo;
  const ativo = ativoRaw === 'S' || ativoRaw === true || ativoRaw === 'true';

  return {
    existe: true,
    ativo,
    dataInativo: data.dataInativo as string | undefined,
  };
}

export interface DadosVeiculo {
  existe: boolean;
  placa?: string;
  chassi?: string;
  tipo?: string;
  marca?: string;
  modelo?: string;
  status?: string;
  mensagem?: string;
}

// Faz uma única chamada de teste à RDV para detectar blacklist sem disparar um relatório completo.
// Retorna { blacklisted: true } se IP bloqueado, { blacklisted: false } caso contrário (mesmo se a placa não existe).
export async function verificarBlacklistRDV(): Promise<{ blacklisted: boolean; mensagem?: string }> {
  try {
    await rdvRequest('obterStatusVeiculo/', { placa: 'TESTE000' });
    return { blacklisted: false };
  } catch (e) {
    if (e instanceof RdvAbortError && e.reason === 'blacklist') {
      return { blacklisted: true, mensagem: e.message };
    }
    return { blacklisted: false };
  }
}

export async function obterDadosVeiculo(placa?: string, chassi?: string): Promise<DadosVeiculo> {
  const body: Record<string, string> = {};
  if (placa) body.placa = placa;
  if (chassi) body.chassi = chassi;

  const data = await rdvRequest('obterDadosVeiculo/', body);

  if (isRdvError(data)) {
    return { existe: false, mensagem: data.message as string | undefined };
  }

  return {
    existe: true,
    placa: data.placa as string | undefined,
    chassi: data.chassi as string | undefined,
    tipo: data.tipo as string | undefined,
    marca: data.marca as string | undefined,
    modelo: data.modelo as string | undefined,
    status: data.status as string | undefined,
  };
}
