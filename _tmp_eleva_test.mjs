import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'C:/Users/lucas/AppData/Local/Temp/claude/C--Users-lucas/c9e3c9cf-1186-4b18-bfe3-cf316a753434/scratchpad';
const USER = 'lucasfontes.anpv';
const PASS = 'Lucas0710!';
const BASE = 'https://sistemas.infornet.com.br/webassist/eleva';

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ acceptDownloads: true, locale: 'pt-BR' });
  const page = await ctx.newPage();

  log('abrindo login...');
  await page.goto(`${BASE}/index.php`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // v2 checkbox visível? (o portal esconde por padrão; usa v3 invisível)
  const v2visivel = await page.locator('.g-recaptchatoken-recaptch-v2').isVisible().catch(() => false);
  log(`checkbox v2 (nao sou robo) visivel? ${v2visivel}`);

  await page.locator('#edtLogin').fill(USER);
  await page.locator('#edtSenha').fill(PASS);
  log('clicando ACESSAR...');
  await page.getByRole('button', { name: /acessar/i }).first().click();

  // espera sair da tela de login (index.php) ou aparecer erro
  let logado = false;
  for (let i = 0; i < 12 && !logado; i++) {
    await page.waitForTimeout(2500);
    const u = page.url();
    logado = /home\.php|principal|menu|rel_/.test(u) || (!u.endsWith('index.php') && !u.endsWith('/eleva/') && !u.includes('index.php'));
    if (i % 3 === 0) log(`  url=${u}`);
  }
  log(`logado? ${logado} — url final: ${page.url()}`);
  await page.screenshot({ path: `${OUT}/eleva_pos_login.png`, fullPage: true }).catch(() => {});

  // tenta a tela de atendimentos
  log('abrindo rel_atendimentos.php...');
  const resp = await page.goto(`${BASE}/cliente/rel_atendimentos.php`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const html = await page.content();
  const expirou = html.includes('SESS') && html.includes('EXPIROU');
  log(`rel_atendimentos: status=${resp?.status()} sessaoExpirou=${expirou} tamanho=${html.length}`);
  fs.writeFileSync(`${OUT}/eleva_rel_atend.html`, html);
  await page.screenshot({ path: `${OUT}/eleva_rel_atend.png`, fullPage: true }).catch(() => {});

  // procura mecanismos de export/filtro na tela
  const achados = {};
  for (const kw of ['xls', 'excel', 'exportar', 'gerar', 'data_inicial', 'data_final', 'periodo', 'csv', 'relatorio', 'placa']) {
    achados[kw] = (html.toLowerCase().match(new RegExp(kw, 'g')) || []).length;
  }
  log('sinais na tela: ' + JSON.stringify(achados));
} catch (e) {
  log('ERRO: ' + e.message);
} finally {
  await browser.close();
}
