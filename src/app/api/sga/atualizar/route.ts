import { NextRequest, NextResponse } from 'next/server';
import { atualizarCacheAtivos } from '@/lib/sga-ativos-cache';
import { registrarLog } from '@/lib/logs';
import { extrairUsuario, COOKIE_NAME } from '@/lib/auth';

export const maxDuration = 300;

// Atualiza a base de veículos ATIVOS do SGA agora, ignorando o TTL do cache.
const lockKey = '__sga_atualizar_rodando';
function estaRodando(): boolean { return Boolean((globalThis as Record<string, unknown>)[lockKey]); }
function setRodando(v: boolean) { (globalThis as Record<string, unknown>)[lockKey] = v; }

export async function POST(req: NextRequest) {
  if (estaRodando()) {
    return NextResponse.json({ ok: false, erro: 'Já existe uma atualização SGA em andamento' }, { status: 409 });
  }
  setRodando(true);
  try {
    const cache = await atualizarCacheAtivos();
    const usuario = req.headers.get('x-usuario') || extrairUsuario(req.cookies.get(COOKIE_NAME)?.value) || 'desconhecido';
    registrarLog(usuario, 'atualizar_sga', `${cache.total} veículos ativos do SGA`);
    return NextResponse.json({ ok: true, total: cache.total, gerado_em: cache.gerado_em });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 });
  } finally {
    setRodando(false);
  }
}
