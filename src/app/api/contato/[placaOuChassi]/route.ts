import { NextRequest, NextResponse } from 'next/server';
import { buscarVeiculoCompleto } from '@/lib/sga';
import { extrairContato } from '@/lib/mensagens';

// GET /api/contato/ABC1234?por=PLACA  (ou ?por=CHASSI)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ placaOuChassi: string }> }
) {
  const { placaOuChassi } = await params;
  const url = new URL(req.url);
  const por = (url.searchParams.get('por') || 'PLACA').toUpperCase();
  const buscarPor: 'PLACA' | 'CHASSI' = por === 'CHASSI' ? 'CHASSI' : 'PLACA';

  const v = await buscarVeiculoCompleto(placaOuChassi, buscarPor);
  if (!v) return NextResponse.json({ erro: 'Veículo não encontrado no SGA' }, { status: 404 });

  return NextResponse.json(extrairContato(v));
}
