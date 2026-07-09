// Robô de atualização da base RDV.
// Loga no portal redeveiculos.com, baixa o "Relatório de Ativos" (Ativos → Lista → Exportar)
// e envia pra rota /api/rdv/importar do próprio app (autenticado por CRON_SECRET).
//
// Uso: node scripts/atualizar-rdv.mjs
// Lê RDV_PORTAL_USER, RDV_PORTAL_SENHA, CRON_SECRET e APP_URL do .env.local.

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR_DOWNLOADS = path.join(RAIZ, 'data', 'downloads-rdv');
const TENTATIVAS = 2;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Carrega .env.local sem depender de dotenv
function carregarEnv() {
  const arquivo = path.join(RAIZ, '.env.local');
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf-8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

async function baixarRelatorio() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ acceptDownloads: true, locale: 'pt-BR' });
    const page = await ctx.newPage();

    log('abrindo página de login...');
    await page.goto('https://redeveiculos.com/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // O JS da página precisa terminar de carregar antes do submit funcionar
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(3_000);
    await page.locator('#auth_user').fill(process.env.RDV_PORTAL_USER);
    await page.locator('#auth_pw').fill(process.env.RDV_PORTAL_SENHA);

    // Clica em Entrar e aguarda sair da tela de login; reclica a cada 15s se o primeiro clique for engolido
    await page.getByRole('button', { name: /entrar/i }).first().click();
    let logado = false;
    for (let espera = 0; espera < 60_000 && !logado; espera += 5_000) {
      await page.waitForTimeout(5_000);
      logado = !page.url().includes('login');
      if (!logado && espera > 0 && espera % 15_000 === 0) {
        await page.getByRole('button', { name: /entrar/i }).first().click().catch(() => {});
      }
    }
    if (!logado) {
      await page.screenshot({ path: path.join(DIR_DOWNLOADS, 'erro-login.png') }).catch(() => {});
      throw new Error(`login não saiu da tela de login (${page.url()})`);
    }
    log(`login ok (${page.url()})`);

    log('abrindo Ativos → Lista...');
    await page.goto('https://redeveiculos.com/veiculos/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByText('Lista').first().click();
    await page.locator('#btn-exportar').waitFor({ state: 'visible', timeout: 60_000 });

    log('clicando em Exportar...');
    const downloadPromise = page.waitForEvent('download', { timeout: 180_000 });
    await page.locator('#btn-exportar').click();
    const download = await downloadPromise;

    const destino = path.join(DIR_DOWNLOADS, download.suggestedFilename() || 'relatorio-ativos.xlsx');
    await download.saveAs(destino);
    const tamanho = fs.statSync(destino).size;
    log(`download concluído: ${path.basename(destino)} (${(tamanho / 1_048_576).toFixed(1)} MB)`);
    if (tamanho < 100_000) throw new Error(`arquivo suspeito de estar incompleto (${tamanho} bytes)`);
    return destino;
  } finally {
    await browser.close();
  }
}

async function importarArquivo(arquivo) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(arquivo)]), path.basename(arquivo));

  log(`enviando pra ${appUrl}/api/rdv/importar...`);
  const res = await fetch(`${appUrl}/api/rdv/importar`, {
    method: 'POST',
    headers: { 'x-cron-token': process.env.CRON_SECRET },
    body: fd,
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok || !corpo.ok) {
    throw new Error(`importação falhou (HTTP ${res.status}): ${corpo.erro || JSON.stringify(corpo).slice(0, 200)}`);
  }
  log(`importação ok: ${corpo.total} veículos (importado_em ${corpo.importado_em})`);
}

async function main() {
  carregarEnv();
  for (const chave of ['RDV_PORTAL_USER', 'RDV_PORTAL_SENHA', 'CRON_SECRET']) {
    if (!process.env[chave]) {
      console.error(`variável ${chave} não definida em .env.local`);
      process.exit(1);
    }
  }

  // Exclui os arquivos baixados nas execuções anteriores
  fs.rmSync(DIR_DOWNLOADS, { recursive: true, force: true });
  fs.mkdirSync(DIR_DOWNLOADS, { recursive: true });

  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const arquivo = await baixarRelatorio();
      await importarArquivo(arquivo);
      log('atualização da base RDV concluída.');
      return;
    } catch (e) {
      ultimoErro = e;
      log(`tentativa ${tentativa}/${TENTATIVAS} falhou: ${e.message}`);
      if (tentativa < TENTATIVAS) await new Promise(r => setTimeout(r, 30_000));
    }
  }
  console.error(`[${new Date().toISOString()}] ERRO: todas as tentativas falharam — ${ultimoErro?.message}`);
  process.exit(1);
}

main();
