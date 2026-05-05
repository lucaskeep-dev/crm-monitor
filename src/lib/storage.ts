import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { RegraFipe, SituacoesConfig, RelatorioInativos, RelatorioAusentes, RelatorioSemPontuar, ConfigMensagens } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const REGRAS_FILE = path.join(DATA_DIR, 'regras-fipe.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function lerRegras(): RegraFipe[] {
  ensureDataDir();
  if (!fs.existsSync(REGRAS_FILE)) {
    return [];
  }
  const raw = fs.readFileSync(REGRAS_FILE, 'utf-8');
  return JSON.parse(raw) as RegraFipe[];
}

function salvarRegras(regras: RegraFipe[]) {
  ensureDataDir();
  fs.writeFileSync(REGRAS_FILE, JSON.stringify(regras, null, 2), 'utf-8');
}

export function listarRegras(): RegraFipe[] {
  return lerRegras();
}

export function criarRegra(dados: Omit<RegraFipe, 'id' | 'criado_em' | 'atualizado_em'>): RegraFipe {
  const regras = lerRegras();
  const agora = new Date().toISOString();
  const novaRegra: RegraFipe = {
    ...dados,
    id: uuidv4(),
    criado_em: agora,
    atualizado_em: agora,
  };
  regras.push(novaRegra);
  salvarRegras(regras);
  return novaRegra;
}

export function atualizarRegra(id: string, dados: Partial<Omit<RegraFipe, 'id' | 'criado_em'>>): RegraFipe | null {
  const regras = lerRegras();
  const idx = regras.findIndex(r => r.id === id);
  if (idx === -1) return null;

  regras[idx] = {
    ...regras[idx],
    ...dados,
    atualizado_em: new Date().toISOString(),
  };
  salvarRegras(regras);
  return regras[idx];
}

export function excluirRegra(id: string): boolean {
  const regras = lerRegras();
  const idx = regras.findIndex(r => r.id === id);
  if (idx === -1) return false;
  regras.splice(idx, 1);
  salvarRegras(regras);
  return true;
}

export function regraSeAplica(
  regra: RegraFipe,
  codigoTipo: number,
  valorFipe: number,
  codigoClassificacao?: number
): boolean {
  if (!regra.ativo) return false;
  if (!regra.tipos.some(t => Number(t.codigo) === codigoTipo)) return false;
  if (valorFipe < regra.valor_fipe_minimo) return false;
  if (regra.valor_fipe_maximo !== null && valorFipe > regra.valor_fipe_maximo) return false;
  // Classificação: se a regra tem filtro, o veículo deve pertencer a uma delas
  if (regra.classificacoes && regra.classificacoes.length > 0 && codigoClassificacao !== undefined) {
    if (!regra.classificacoes.some(c => Number(c.codigo) === codigoClassificacao)) return false;
  }
  return true;
}

// --- Configuração de situações inativas ---

const SITUACOES_FILE = path.join(DATA_DIR, 'situacoes-inativas.json');

export function lerSituacoesConfig(): SituacoesConfig {
  ensureDataDir();
  if (!fs.existsSync(SITUACOES_FILE)) {
    return { codigos_inativos: [], atualizado_em: new Date().toISOString() };
  }
  const raw = fs.readFileSync(SITUACOES_FILE, 'utf-8');
  return JSON.parse(raw) as SituacoesConfig;
}

export function salvarSituacoesConfig(codigos: number[]): SituacoesConfig {
  ensureDataDir();
  const config: SituacoesConfig = {
    codigos_inativos: codigos,
    atualizado_em: new Date().toISOString(),
  };
  fs.writeFileSync(SITUACOES_FILE, JSON.stringify(config, null, 2), 'utf-8');
  return config;
}

// --- Ignorados (sem rastreador FIPE) ---

export interface VeiculoIgnorado {
  placa: string;
  adicionado_em: string;
}

const IGNORADOS_FILE = path.join(DATA_DIR, 'ignorados-ausentes.json');

export function lerIgnorados(): VeiculoIgnorado[] {
  ensureDataDir();
  if (!fs.existsSync(IGNORADOS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(IGNORADOS_FILE, 'utf-8')) as { ignorados?: VeiculoIgnorado[] };
    return raw.ignorados ?? [];
  } catch { return []; }
}

export function salvarIgnorados(ignorados: VeiculoIgnorado[]): void {
  ensureDataDir();
  fs.writeFileSync(IGNORADOS_FILE, JSON.stringify({ ignorados }, null, 2), 'utf-8');
}

export function adicionarIgnorados(placas: string[]): VeiculoIgnorado[] {
  const atuais = lerIgnorados();
  const existentes = new Set(atuais.map(i => i.placa.toUpperCase()));
  const agora = new Date().toISOString();
  for (const p of placas) {
    const key = p.toUpperCase().trim();
    if (key && !existentes.has(key)) {
      atuais.push({ placa: key, adicionado_em: agora });
      existentes.add(key);
    }
  }
  salvarIgnorados(atuais);
  return atuais;
}

export function removerIgnorados(placas: string[]): VeiculoIgnorado[] {
  const keys = new Set(placas.map(p => p.toUpperCase().trim()));
  const atuais = lerIgnorados().filter(i => !keys.has(i.placa.toUpperCase()));
  salvarIgnorados(atuais);
  return atuais;
}

// --- Cache de relatórios ---

const CACHE_INATIVOS_FILE = path.join(DATA_DIR, 'cache-inativos.json');
const CACHE_AUSENTES_FILE = path.join(DATA_DIR, 'cache-ausentes.json');

export function lerCacheInativos(): RelatorioInativos | null {
  ensureDataDir();
  if (!fs.existsSync(CACHE_INATIVOS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_INATIVOS_FILE, 'utf-8')) as RelatorioInativos;
  } catch { return null; }
}

export function salvarCacheInativos(relatorio: RelatorioInativos): void {
  ensureDataDir();
  fs.writeFileSync(CACHE_INATIVOS_FILE, JSON.stringify(relatorio, null, 2), 'utf-8');
}

export function lerCacheAusentes(): RelatorioAusentes | null {
  ensureDataDir();
  if (!fs.existsSync(CACHE_AUSENTES_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_AUSENTES_FILE, 'utf-8')) as RelatorioAusentes;
  } catch { return null; }
}

export function salvarCacheAusentes(relatorio: RelatorioAusentes): void {
  ensureDataDir();
  fs.writeFileSync(CACHE_AUSENTES_FILE, JSON.stringify(relatorio, null, 2), 'utf-8');
}

const CACHE_SEM_PONTUAR_FILE = path.join(DATA_DIR, 'cache-sem-pontuar.json');

export function lerCacheSemPontuar(): RelatorioSemPontuar | null {
  ensureDataDir();
  if (!fs.existsSync(CACHE_SEM_PONTUAR_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_SEM_PONTUAR_FILE, 'utf-8')) as RelatorioSemPontuar;
  } catch { return null; }
}

export function salvarCacheSemPontuar(relatorio: RelatorioSemPontuar): void {
  ensureDataDir();
  fs.writeFileSync(CACHE_SEM_PONTUAR_FILE, JSON.stringify(relatorio, null, 2), 'utf-8');
}

// --- Configuração de mensagens (WhatsApp + E-mail) ---

const CONFIG_MENSAGENS_FILE = path.join(DATA_DIR, 'config-mensagens.json');

const CONFIG_MENSAGENS_DEFAULT: Omit<ConfigMensagens, 'atualizado_em'> = {
  whatsapp: {
    habilitado: false,
    phone_number_id: '',
    access_token: '',
    template_name: '',
    template_language: 'pt_BR',
    variaveis: ['nome', 'placa', 'modelo', 'dias_sem_pontuar'],
  },
  email: {
    habilitado: false,
    smtp_host: '',
    smtp_port: 465,
    smtp_secure: true,
    smtp_user: '',
    smtp_pass: '',
    from_name: 'Zen Seguros',
    from_email: '',
    reply_to: '',
    assunto: 'Veículo {placa} sem pontuação no rastreamento',
    corpo_html: '<p>Olá {nome},</p>\n<p>Identificamos que seu veículo <b>{placa}</b> ({modelo}) está sem registro de pontuação no rastreamento há <b>{dias_sem_pontuar} dia(s)</b>.</p>\n<p>Por favor, entre em contato conosco para regularizar.</p>\n<p>Atenciosamente,<br/>{from_name}</p>',
  },
};

export function lerConfigMensagens(): ConfigMensagens {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_MENSAGENS_FILE)) {
    return { ...CONFIG_MENSAGENS_DEFAULT, atualizado_em: new Date(0).toISOString() };
  }
  try {
    const raw = fs.readFileSync(CONFIG_MENSAGENS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ConfigMensagens>;
    // Merge com defaults para tolerar configs antigas
    return {
      whatsapp: { ...CONFIG_MENSAGENS_DEFAULT.whatsapp, ...(parsed.whatsapp ?? {}) },
      email: { ...CONFIG_MENSAGENS_DEFAULT.email, ...(parsed.email ?? {}) },
      atualizado_em: parsed.atualizado_em ?? new Date(0).toISOString(),
    };
  } catch {
    return { ...CONFIG_MENSAGENS_DEFAULT, atualizado_em: new Date(0).toISOString() };
  }
}

export function salvarConfigMensagens(config: Omit<ConfigMensagens, 'atualizado_em'>): ConfigMensagens {
  ensureDataDir();
  const completo: ConfigMensagens = { ...config, atualizado_em: new Date().toISOString() };
  fs.writeFileSync(CONFIG_MENSAGENS_FILE, JSON.stringify(completo, null, 2), 'utf-8');
  return completo;
}
