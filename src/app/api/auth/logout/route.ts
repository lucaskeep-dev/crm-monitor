import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { registrarLog } from '@/lib/logs';

export async function POST(req: NextRequest) {
  const usuario = req.headers.get('x-usuario') || 'desconhecido';
  registrarLog(usuario, 'logout');
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
