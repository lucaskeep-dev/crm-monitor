import fs from 'fs';
import path from 'path';

const RDV_LOCAL_FILE = path.join(process.cwd(), 'data', 'rdv-ativos.json');

export interface RdvVeiculoLocal {
  placa: string;
  chassi: string;
  ultimaConexao: string | null; // ISO string
  bloqueio: boolean;
  cliente: string;
  cpfCnpj: string;
  imei?: string;
  serialChip?: string;
  numeroChip?: string;
}

export interface RdvLocalData {
  veiculos: RdvVeiculoLocal[];
  importado_em: string;
  total: number;
}

// Cache em memória para não ler o arquivo a cada consulta
let _cache: RdvLocalData | null = null;
let _cacheFile: string | null = null;

export function lerRdvLocal(): RdvLocalData | null {
  try {
    if (!fs.existsSync(RDV_LOCAL_FILE)) return null;
    const stat = fs.statSync(RDV_LOCAL_FILE);
    const mtime = stat.mtimeMs.toString();
    if (_cache && _cacheFile === mtime) return _cache;
    _cache = JSON.parse(fs.readFileSync(RDV_LOCAL_FILE, 'utf-8')) as RdvLocalData;
    _cacheFile = mtime;
    return _cache;
  } catch { return null; }
}

export function salvarRdvLocal(data: RdvLocalData): void {
  fs.mkdirSync(path.dirname(RDV_LOCAL_FILE), { recursive: true });
  fs.writeFileSync(RDV_LOCAL_FILE, JSON.stringify(data), 'utf-8');
  _cache = data;
  _cacheFile = null;
}

// Builds lookup maps indexed by placa and chassi (uppercase, trimmed)
let _mapaPlaca: Map<string, RdvVeiculoLocal> | null = null;
let _mapaChassi: Map<string, RdvVeiculoLocal> | null = null;
let _mapaImportadoEm: string | null = null;

function obterMapas(): { placa: Map<string, RdvVeiculoLocal>; chassi: Map<string, RdvVeiculoLocal> } | null {
  const data = lerRdvLocal();
  if (!data) return null;
  if (_mapaImportadoEm === data.importado_em && _mapaPlaca && _mapaChassi) {
    return { placa: _mapaPlaca, chassi: _mapaChassi };
  }
  _mapaPlaca = new Map();
  _mapaChassi = new Map();
  for (const v of data.veiculos) {
    if (v.placa && v.placa !== 'Não informado') _mapaPlaca.set(v.placa.toUpperCase().trim(), v);
    if (v.chassi && v.chassi !== 'Não informado') _mapaChassi.set(v.chassi.toUpperCase().trim(), v);
  }
  _mapaImportadoEm = data.importado_em;
  return { placa: _mapaPlaca, chassi: _mapaChassi };
}

export interface RdvLocalStatus {
  encontrado: boolean;
  veiculo?: RdvVeiculoLocal;
}

export function consultarRdvLocal(placa?: string, chassi?: string): RdvLocalStatus {
  const mapas = obterMapas();
  if (!mapas) return { encontrado: false };

  if (placa) {
    const v = mapas.placa.get(placa.toUpperCase().trim());
    if (v) return { encontrado: true, veiculo: v };
  }
  if (chassi) {
    const v = mapas.chassi.get(chassi.toUpperCase().trim());
    if (v) return { encontrado: true, veiculo: v };
  }
  return { encontrado: false };
}

export function rdvLocalDisponivel(): boolean {
  return lerRdvLocal() !== null;
}

export function statsRdvLocal(): { total: number; importado_em: string } | null {
  const d = lerRdvLocal();
  if (!d) return null;
  return { total: d.total, importado_em: d.importado_em };
}
