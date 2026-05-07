import { NextRequest, NextResponse } from 'next/server';
import { lerUsuarios, salvarUsuarios } from '@/lib/usuarios';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lista = lerUsuarios();
  if (!lista.find(u => u.id === id)) {
    return NextResponse.json({ ok: false, erro: 'Usuário não encontrado' }, { status: 404 });
  }
  if (lista.length <= 1) {
    return NextResponse.json({ ok: false, erro: 'Não é possível remover o único usuário' }, { status: 400 });
  }
  salvarUsuarios(lista.filter(u => u.id !== id));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { senha } = await req.json();
  if (!senha?.trim()) {
    return NextResponse.json({ ok: false, erro: 'Senha obrigatória' }, { status: 400 });
  }
  const { hashSenha } = await import('@/lib/usuarios');
  const lista = lerUsuarios();
  const idx = lista.findIndex(u => u.id === id);
  if (idx === -1) return NextResponse.json({ ok: false, erro: 'Usuário não encontrado' }, { status: 404 });
  lista[idx].senhaHash = await hashSenha(senha);
  salvarUsuarios(lista);
  return NextResponse.json({ ok: true });
}
