import fs from 'fs';
import path from 'path';
import { verificarBlacklistRDV } from './rdv';
import { rdvLocalDisponivel } from './rdv-local';

// Intervalos
const ENTRE_CICLOS_MS = 60_000;        // 1 min entre ciclos completos
const ESPERA_BLACKLIST_MS = 10 * 60_000; // 10 min após detectar blacklist
const STARTUP_DELAY_MS = 10_000;

const PORT = process.env.PORT || '3002';
const BASE_URL = process.env.REFRESH_BASE_URL || `http://localhost:${PORT}`;

// Lock anti-concorrência por relatório
const running = { inativos: false, ausentes: false, semPontuar: false };

interface CacheStatus { status?: string; gerado_em?: string }

function lerStatus(arquivo: string): CacheStatus {
  try {
    const p = path.join(process.cwd(), 'data', arquivo);
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as CacheStatus;
  } catch { return {}; }
}

async function consumirStream(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.body) return;
  const reader = res.body.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

async function chamarAtualizar(url: string): Promise<void> {
  await fetch(url);
}

// Decide se roda scan completo (stream) ou apenas verifica veículos já no cache (atualizar)
async function refreshInativos(): Promise<void> {
  if (running.inativos) return;
  running.inativos = true;
  try {
    const s = lerStatus('cache-inativos.json');
    if (s.status === 'concluido') {
      console.log('[auto-refresh] Inativos: atualizando veículos existentes...');
      await chamarAtualizar(`${BASE_URL}/api/relatorio/inativos/atualizar`);
    } else {
      console.log('[auto-refresh] Inativos: scan completo...');
      await consumirStream(`${BASE_URL}/api/relatorio/inativos/stream`);
    }
    const sAtual = lerStatus('cache-inativos.json');
    console.log(`[auto-refresh] Inativos: terminou (status=${sAtual.status ?? 'desconhecido'})`);
  } catch (e) {
    console.error('[auto-refresh] Inativos falhou:', e);
  } finally {
    running.inativos = false;
  }
}

async function refreshAusentes(): Promise<void> {
  if (running.ausentes) return;
  running.ausentes = true;
  try {
    const s = lerStatus('cache-ausentes.json');
    if (s.status === 'concluido') {
      console.log('[auto-refresh] Ausentes: atualizando veículos existentes...');
      await chamarAtualizar(`${BASE_URL}/api/relatorio/ausentes/atualizar`);
    } else {
      console.log('[auto-refresh] Ausentes: scan completo...');
      await consumirStream(`${BASE_URL}/api/relatorio/ausentes/stream`);
    }
    const sAtual = lerStatus('cache-ausentes.json');
    console.log(`[auto-refresh] Ausentes: terminou (status=${sAtual.status ?? 'desconhecido'})`);
  } catch (e) {
    console.error('[auto-refresh] Ausentes falhou:', e);
  } finally {
    running.ausentes = false;
  }
}

async function refreshSemPontuar(): Promise<void> {
  if (running.semPontuar) return;
  running.semPontuar = true;
  try {
    const s = lerStatus('cache-sem-pontuar.json');
    if (s.status === 'concluido') {
      console.log('[auto-refresh] Sem-pontuar: atualizando veículos existentes...');
      await chamarAtualizar(`${BASE_URL}/api/relatorio/sem-pontuar/atualizar`);
    } else {
      console.log('[auto-refresh] Sem-pontuar: scan completo...');
      const cachePath = path.join(process.cwd(), 'data', 'cache-sem-pontuar.json');
      let dias = 30;
      if (fs.existsSync(cachePath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as { dias_filtro?: number };
          dias = Math.max(7, cache.dias_filtro ?? 30);
        } catch { /* usa default */ }
      }
      const params = new URLSearchParams({ dias: String(dias) });
      await consumirStream(`${BASE_URL}/api/relatorio/sem-pontuar/stream?${params}`);
    }
    const sAtual = lerStatus('cache-sem-pontuar.json');
    console.log(`[auto-refresh] Sem-pontuar: terminou (status=${sAtual.status ?? 'desconhecido'})`);
  } catch (e) {
    console.error('[auto-refresh] Sem-pontuar falhou:', e);
  } finally {
    running.semPontuar = false;
  }
}

// Roda os 3 relatórios sequencialmente. Detecta blacklist via status do cache pós-execução.
async function executarCiclo(): Promise<{ blacklisted: boolean }> {
  const localDisponivel = rdvLocalDisponivel();

  await refreshInativos();
  if (!localDisponivel && lerStatus('cache-inativos.json').status === 'erro') {
    const check = await verificarBlacklistRDV();
    if (check.blacklisted) return { blacklisted: true };
  }

  await refreshAusentes();
  if (!localDisponivel && lerStatus('cache-ausentes.json').status === 'erro') {
    const check = await verificarBlacklistRDV();
    if (check.blacklisted) return { blacklisted: true };
  }

  await refreshSemPontuar();
  if (!localDisponivel && lerStatus('cache-sem-pontuar.json').status === 'erro') {
    const check = await verificarBlacklistRDV();
    if (check.blacklisted) return { blacklisted: true };
  }

  return { blacklisted: false };
}

function agendarProximo(delayMs: number) {
  const minutos = Math.ceil(delayMs / 60_000);
  console.log(`[auto-refresh] Próximo ciclo em ${minutos} min`);
  setTimeout(loop, delayMs);
}

async function loop() {
  // Se o arquivo local da RDV está disponível, os relatórios não chamam a API — sem risco de blacklist
  if (!rdvLocalDisponivel()) {
    const checkInicial = await verificarBlacklistRDV();
    if (checkInicial.blacklisted) {
      console.log(`[auto-refresh] IP na blacklist da RDV — aguardando ${ESPERA_BLACKLIST_MS / 60000} min antes de testar de novo`);
      agendarProximo(ESPERA_BLACKLIST_MS);
      return;
    }
  }

  console.log('[auto-refresh] Iniciando ciclo de atualização...');
  let resultado: { blacklisted: boolean } = { blacklisted: false };
  try {
    resultado = await executarCiclo();
  } catch (e) {
    console.error('[auto-refresh] Erro no ciclo:', e);
  }

  if (resultado.blacklisted) {
    console.log('[auto-refresh] Blacklist detectada durante ciclo — pausando');
    agendarProximo(ESPERA_BLACKLIST_MS);
  } else {
    console.log('[auto-refresh] Ciclo concluído');
    agendarProximo(ENTRE_CICLOS_MS);
  }
}

export function registerAutoRefresh(): void {
  if ((globalThis as { __autoRefreshStarted?: boolean }).__autoRefreshStarted) return;
  (globalThis as { __autoRefreshStarted?: boolean }).__autoRefreshStarted = true;

  console.log('[auto-refresh] Inicializado — scan completo na 1ª vez, incremental após conclusão (1 min entre ciclos, 10 min se blacklist)');
  setTimeout(loop, STARTUP_DELAY_MS);
}
