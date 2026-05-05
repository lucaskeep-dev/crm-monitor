import { NextResponse } from 'next/server';
import { listarSituacoesVeiculo, listarVeiculosPorSituacao } from '@/lib/sga';
import { obterStatusVeiculo } from '@/lib/rdv';
import { listarRegras, regraSeAplica } from '@/lib/storage';
import { VeiculoAusenteRDV } from '@/types';

export async function GET() {
  const gerado_em = new Date().toISOString();

  try {
    const regrasAtivas = listarRegras().filter(r => r.ativo);

    if (regrasAtivas.length === 0) {
      return NextResponse.json({
        total: 0,
        veiculos: [],
        gerado_em,
        aviso: 'Nenhuma regra FIPE cadastrada. Acesse "Regras FIPE" para configurar.',
      });
    }

    // Descobrir o código da situação "ativo" no SGA
    const todasSituacoes = await listarSituacoesVeiculo();
    const situacaoAtiva = todasSituacoes.find(s =>
      (s.descricao_situacao || s.situacao || '').toUpperCase() === 'ATIVO'
    );

    if (!situacaoAtiva) {
      return NextResponse.json({
        total: 0,
        veiculos: [],
        gerado_em,
        erro: 'Situação "ATIVO" não encontrada no SGA.',
      });
    }

    const veiculosAtivos = await listarVeiculosPorSituacao(situacaoAtiva.codigo_situacao);

    const ausentes: VeiculoAusenteRDV[] = [];

    const checagens = await Promise.allSettled(
      veiculosAtivos.map(async (v) => {
        const codigoTipo = Number(v.codigo_tipo || v.codigo_tipo_veiculo || 0);
        const valorFipe = Number(v.valor_fipe || 0);

        const regraAplicavel = regrasAtivas.find(r => regraSeAplica(r, codigoTipo, valorFipe));
        if (!regraAplicavel) return null;

        if (!v.placa && !v.chassi) return null;

        const statusRDV = await obterStatusVeiculo(v.placa || undefined, v.chassi || undefined);
        if (statusRDV.existe) return null;

        const nomeTipos = regraAplicavel.tipos.map(t => t.nome).join(', ');
        const fipeMin = regraAplicavel.valor_fipe_minimo.toLocaleString('pt-BR');
        const fipeMax = regraAplicavel.valor_fipe_maximo
          ? regraAplicavel.valor_fipe_maximo.toLocaleString('pt-BR')
          : null;

        return {
          placa: v.placa || '',
          chassi: v.chassi || '',
          modelo: v.modelo || '',
          marca: v.marca || '',
          tipo_veiculo: v.tipo || v.tipo_veiculo || String(codigoTipo),
          valor_fipe: valorFipe,
          regra_aplicada: `${nomeTipos} | FIPE: R$ ${fipeMin}${fipeMax ? ` - R$ ${fipeMax}` : '+'}`,
          codigo_associado: v.codigo_associado ? Number(v.codigo_associado) : null,
          nome_associado: v.nome_associado || null,
          cpf_associado: v.cpf_associado || null,
        } as VeiculoAusenteRDV;
      })
    );

    for (const r of checagens) {
      if (r.status === 'fulfilled' && r.value !== null) {
        ausentes.push(r.value);
      }
    }

    return NextResponse.json({ total: ausentes.length, veiculos: ausentes, gerado_em });
  } catch (error) {
    return NextResponse.json({ total: 0, veiculos: [], gerado_em, erro: String(error) }, { status: 500 });
  }
}
