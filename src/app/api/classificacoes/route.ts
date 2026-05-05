import { NextResponse } from 'next/server';
import { listarClassificacoesVeiculo } from '@/lib/sga';

export async function GET() {
  try {
    const classificacoes = await listarClassificacoesVeiculo();
    return NextResponse.json(classificacoes);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
