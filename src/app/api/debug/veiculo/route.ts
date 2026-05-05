import { NextResponse } from 'next/server';
import { listarSituacoesVeiculo, sgaRequestRaw } from '@/lib/sga';

export async function GET() {
  const todasSituacoes = await listarSituacoesVeiculo();
  const situacaoAtiva = todasSituacoes.find(s =>
    (s.descricao_situacao || s.situacao || '').toUpperCase() === 'ATIVO'
  );

  if (!situacaoAtiva) {
    return NextResponse.json({ erro: 'Situação ATIVO não encontrada' });
  }

  const data = await sgaRequestRaw('listar/veiculo', {
    method: 'POST',
    body: JSON.stringify({
      codigo_situacao: situacaoAtiva.codigo_situacao,
      inicio_paginacao: 0,
      quantidade_por_pagina: 3,
    }),
  });

  return NextResponse.json(data);
}
