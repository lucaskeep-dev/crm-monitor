import fs from 'fs';
import path from 'path';

const LOGS_FILE = path.join(process.cwd(), 'data', 'logs.json');
const MAX_ENTRIES = 2000;

export interface LogEntry {
  id: string;
  timestamp: string;
  usuario: string;
  acao: string;
  detalhes?: string;
}

export function registrarLog(usuario: string, acao: string, detalhes?: string): void {
  try {
    let lista: LogEntry[] = [];
    if (fs.existsSync(LOGS_FILE)) {
      lista = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8')) as LogEntry[];
    }
    lista.unshift({ id: Date.now().toString(), timestamp: new Date().toISOString(), usuario, acao, detalhes });
    if (lista.length > MAX_ENTRIES) lista = lista.slice(0, MAX_ENTRIES);
    fs.mkdirSync(path.dirname(LOGS_FILE), { recursive: true });
    fs.writeFileSync(LOGS_FILE, JSON.stringify(lista, null, 2), 'utf-8');
  } catch { /* não interrompe a operação principal */ }
}

export function lerLogs(): LogEntry[] {
  try {
    if (!fs.existsSync(LOGS_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8')) as LogEntry[];
  } catch { return []; }
}
