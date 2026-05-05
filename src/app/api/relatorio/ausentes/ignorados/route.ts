import { NextRequest, NextResponse } from 'next/server';
import { lerIgnorados, adicionarIgnorados, removerIgnorados } from '@/lib/storage';

export async function GET() {
  return NextResponse.json({ ignorados: lerIgnorados() });
}

export async function POST(req: NextRequest) {
  const { placas } = await req.json() as { placas: string[] };
  if (!Array.isArray(placas) || placas.length === 0)
    return NextResponse.json({ erro: 'placas obrigatório' }, { status: 400 });
  const resultado = adicionarIgnorados(placas);
  return NextResponse.json({ ignorados: resultado });
}

export async function DELETE(req: NextRequest) {
  const { placas } = await req.json() as { placas: string[] };
  if (!Array.isArray(placas) || placas.length === 0)
    return NextResponse.json({ erro: 'placas obrigatório' }, { status: 400 });
  const resultado = removerIgnorados(placas);
  return NextResponse.json({ ignorados: resultado });
}
