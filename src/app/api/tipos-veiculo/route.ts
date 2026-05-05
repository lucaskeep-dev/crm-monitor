import { NextResponse } from 'next/server';
import { listarTiposVeiculo } from '@/lib/sga';

export async function GET() {
  try {
    const tipos = await listarTiposVeiculo();
    return NextResponse.json(tipos);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao listar tipos de veículo', detalhe: String(error) }, { status: 500 });
  }
}
