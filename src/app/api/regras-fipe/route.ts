import { NextRequest, NextResponse } from 'next/server';
import { listarRegras, criarRegra, atualizarRegra, excluirRegra } from '@/lib/storage';

export async function GET() {
  try {
    const regras = listarRegras();
    return NextResponse.json(regras);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao listar regras', detalhe: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tipos, classificacoes, valor_fipe_minimo, valor_fipe_maximo, ativo } = body;

    if (!tipos || !Array.isArray(tipos) || tipos.length === 0 || valor_fipe_minimo === undefined) {
      return NextResponse.json({ error: 'Campos obrigatórios: tipos (array), valor_fipe_minimo' }, { status: 400 });
    }

    const tiposNormalizados = tipos.map((t: { codigo: unknown; nome: string }) => ({
      codigo: Number(t.codigo),
      nome: t.nome,
    }));

    const classificacoesNormalizadas = Array.isArray(classificacoes)
      ? classificacoes.map((c: { codigo: unknown; nome: string }) => ({ codigo: Number(c.codigo), nome: c.nome }))
      : [];

    const regra = criarRegra({
      tipos: tiposNormalizados,
      classificacoes: classificacoesNormalizadas,
      valor_fipe_minimo: Number(valor_fipe_minimo),
      valor_fipe_maximo: valor_fipe_maximo ? Number(valor_fipe_maximo) : null,
      ativo: ativo !== false,
    });

    return NextResponse.json(regra, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar regra', detalhe: String(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...dados } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    const regra = atualizarRegra(id, dados);
    if (!regra) {
      return NextResponse.json({ error: 'Regra não encontrada' }, { status: 404 });
    }

    return NextResponse.json(regra);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao atualizar regra', detalhe: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });
    }

    const removida = excluirRegra(id);
    if (!removida) {
      return NextResponse.json({ error: 'Regra não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ sucesso: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao excluir regra', detalhe: String(error) }, { status: 500 });
  }
}
