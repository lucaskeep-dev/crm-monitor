import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { registrarLog } from '@/lib/logs';
import { extrairUsuario, COOKIE_NAME } from '@/lib/auth';

export const maxDuration = 30;

// Dispara o robô de atualização da base RDV (scripts/atualizar-rdv.mjs) sob demanda.
// O processo roda em segundo plano; o front acompanha pelo importado_em em /api/rdv/local-stats.
const lockKey = '__atualizar_rdv_rodando';

function estaRodando(): boolean { return Boolean((globalThis as Record<string, unknown>)[lockKey]); }
function setRodando(v: boolean) { (globalThis as Record<string, unknown>)[lockKey] = v; }

export async function GET() {
  return NextResponse.json({ ok: true, rodando: estaRodando() });
}

export async function POST(req: NextRequest) {
  if (estaRodando()) {
    return NextResponse.json({ ok: false, erro: 'Já existe uma atualização em andamento' }, { status: 409 });
  }
  setRodando(true);

  try {
    const usuario = req.headers.get('x-usuario') || extrairUsuario(req.cookies.get(COOKIE_NAME)?.value) || 'desconhecido';
    registrarLog(usuario, 'atualizar_rdv', 'disparou atualização manual da base RDV (robô)');

    const script = path.join(process.cwd(), 'scripts', 'atualizar-rdv.mjs');
    const log = fs.openSync(path.join(process.cwd(), 'data', 'atualizar-rdv.log'), 'a');
    const child = spawn(process.execPath, [script], { cwd: process.cwd(), stdio: ['ignore', log, log] });

    child.on('exit', () => { setRodando(false); fs.closeSync(log); });
    child.on('error', () => { setRodando(false); fs.closeSync(log); });
    // Trava de segurança: libera o lock após 10 min mesmo se o exit não disparar
    setTimeout(() => setRodando(false), 10 * 60_000).unref?.();

    return NextResponse.json({ ok: true });
  } catch (e) {
    setRodando(false);
    return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 });
  }
}
