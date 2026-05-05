import { NextResponse } from 'next/server';
import { listarSituacoesVeiculo } from '@/lib/sga';
import { lerSituacoesConfig, salvarSituacoesConfig } from '@/lib/storage';
import { SituacaoComConfig } from '@/types';

export async function GET() {
  try {
    const [situacoes, config] = await Promise.all([
      listarSituacoesVeiculo(),
      Promise.resolve(lerSituacoesConfig()),
    ]);

    const resultado: SituacaoComConfig[] = situacoes.map(s => ({
      ...s,
      marcada_inativa: config.codigos_inativos.includes(s.codigo_situacao),
    }));

    resultado.sort((a, b) =>
      (a.descricao_situacao || a.situacao).localeCompare(b.descricao_situacao || b.situacao, 'pt-BR')
    );

    return NextResponse.json({
      situacoes: resultado,
      atualizado_em: config.atualizado_em,
    });
  } catch (error) {
    return NextResponse.json({ erro: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw: unknown[] = body.codigos_inativos;

    if (!Array.isArray(raw)) {
      return NextResponse.json({ erro: 'codigos_inativos deve ser um array' }, { status: 400 });
    }

    const codigos = raw.map(c => Number(c)).filter(c => !isNaN(c));
    const config = salvarSituacoesConfig(codigos);
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ erro: String(error) }, { status: 500 });
  }
}
