import { NextRequest, NextResponse } from 'next/server';
import { criarToken, COOKIE_NAME } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { usuario, senha } = await req.json();

  if (
    !process.env.AUTH_USERNAME || !process.env.AUTH_PASSWORD ||
    usuario !== process.env.AUTH_USERNAME || senha !== process.env.AUTH_PASSWORD
  ) {
    return NextResponse.json({ ok: false, erro: 'Usuário ou senha incorretos' }, { status: 401 });
  }

  const token = await criarToken(usuario);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
  return res;
}
