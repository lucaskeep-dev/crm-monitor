import { NextRequest, NextResponse } from 'next/server';
import { obterUltimaPosicaoValida } from '@/lib/rdv';

// Debug: GET /api/debug/posicao?placa=ABC1234
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const placa = searchParams.get('placa') || undefined;
  const chassi = searchParams.get('chassi') || undefined;

  if (!placa && !chassi) {
    return NextResponse.json({ erro: 'Informe ?placa=XXX ou ?chassi=XXX' }, { status: 400 });
  }

  const resultado = await obterUltimaPosicaoValida(placa, chassi);
  return NextResponse.json(resultado);
}
