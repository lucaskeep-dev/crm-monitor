import { NextRequest, NextResponse } from 'next/server';
import { criarToken, COOKIE_NAME } from '@/lib/auth';
import { lerUsuarios, verificarSenha, hashSenha, salvarUsuarios } from '@/lib/usuarios';

export async function POST(req: NextRequest) {
  const { usuario, senha } = await req.json();
  if (!usuario || !senha) {
    return NextResponse.json({ ok: false, erro: 'Usuário e senha obrigatórios' }, { status: 400 });
  }

  const usuarios = lerUsuarios();

  if (usuarios.length === 0) {
    // Sem usuários cadastrados — usa env vars e migra automaticamente para o arquivo
    const envUser = process.env.AUTH_USERNAME;
    const envPass = process.env.AUTH_PASSWORD;
    if (!envUser || !envPass || usuario !== envUser || senha !== envPass) {
      return NextResponse.json({ ok: false, erro: 'Usuário ou senha incorretos' }, { status: 401 });
    }
    // Migra env user para o arquivo
    const hash = await hashSenha(envPass);
    salvarUsuarios([{ id: Date.now().toString(), usuario: envUser, senhaHash: hash, criadoEm: new Date().toISOString() }]);
  } else {
    const u = usuarios.find(u => u.usuario.toLowerCase() === usuario.toLowerCase());
    if (!u || !(await verificarSenha(senha, u.senhaHash))) {
      return NextResponse.json({ ok: false, erro: 'Usuário ou senha incorretos' }, { status: 401 });
    }
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
