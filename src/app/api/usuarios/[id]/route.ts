import { NextRequest, NextResponse } from 'next/server';
import { lerUsuarios, salvarUsuarios } from '@/lib/usuarios';
import { registrarLog } from '@/lib/logs';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lista = lerUsuarios();
  const alvo = lista.find(u => u.id === id);
  if (!alvo) return NextResponse.json({ ok: false, erro: 'Usuário não encontrado' }, { status: 404 });
  if (lista.length <= 1) return NextResponse.json({ ok: false, erro: 'Não é possível remover o único usuário' }, { status: 400 });
  salvarUsuarios(lista.filter(u => u.id !== id));
  registrarLog(req.headers.get('x-usuario') || 'desconhecido', 'remover_usuario', `Usuário removido: ${alvo.usuario}`);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { senha } = await req.json();
  if (!senha?.trim()) return NextResponse.json({ ok: false, erro: 'Senha obrigatória' }, { status: 400 });
  const { hashSenha } = await import('@/lib/usuarios');
  const lista = lerUsuarios();
  const idx = lista.findIndex(u => u.id === id);
  if (idx === -1) return NextResponse.json({ ok: false, erro: 'Usuário não encontrado' }, { status: 404 });
  lista[idx].senhaHash = await hashSenha(senha);
  salvarUsuarios(lista);
  registrarLog(req.headers.get('x-usuario') || 'desconhecido', 'alterar_senha', `Senha alterada para: ${lista[idx].usuario}`);
  return NextResponse.json({ ok: true });
}
