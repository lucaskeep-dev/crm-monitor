import { NextRequest, NextResponse } from 'next/server';
import { lerUsuarios, salvarUsuarios, hashSenha } from '@/lib/usuarios';

export async function GET() {
  const usuarios = lerUsuarios().map(({ id, usuario, criadoEm }) => ({ id, usuario, criadoEm }));
  return NextResponse.json(usuarios);
}

export async function POST(req: NextRequest) {
  const { usuario, senha } = await req.json();
  if (!usuario?.trim() || !senha?.trim()) {
    return NextResponse.json({ ok: false, erro: 'Usuário e senha obrigatórios' }, { status: 400 });
  }

  const lista = lerUsuarios();
  if (lista.some(u => u.usuario.toLowerCase() === usuario.toLowerCase())) {
    return NextResponse.json({ ok: false, erro: 'Usuário já existe' }, { status: 409 });
  }

  const novo = {
    id: Date.now().toString(),
    usuario: usuario.trim(),
    senhaHash: await hashSenha(senha),
    criadoEm: new Date().toISOString(),
  };
  salvarUsuarios([...lista, novo]);
  return NextResponse.json({ ok: true, id: novo.id, usuario: novo.usuario, criadoEm: novo.criadoEm });
}
