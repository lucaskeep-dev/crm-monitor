import { NextRequest, NextResponse } from 'next/server';
import { lerConfigMensagens, salvarConfigMensagens } from '@/lib/storage';
import { ConfigMensagens } from '@/types';

export async function GET() {
  return NextResponse.json(lerConfigMensagens());
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Omit<ConfigMensagens, 'atualizado_em'>;
    if (!body || !body.whatsapp || !body.email) {
      return NextResponse.json({ erro: 'Payload inválido' }, { status: 400 });
    }
    const config = salvarConfigMensagens(body);
    return NextResponse.json(config);
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
