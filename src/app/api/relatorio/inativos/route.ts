import { NextResponse } from 'next/server';
import { listarVeiculosPorSituacao, listarSituacoesVeiculo } from '@/lib/sga';
import { obterStatusVeiculo } from '@/lib/rdv';
import { lerSituacoesConfig } from '@/lib/storage';
import { VeiculoInativoRDV } from '@/types';

function calcularInativoDesde(mesReferente: string | null | undefined, diaVencimento: string | null | undefined): { dataInativo: string | null; dias: number | null } {
  if (!mesReferente) return { dataInativo: null, dias: null };
  const partes = mesReferente.split('/');
  if (partes.length !== 2) return { dataInativo: null, dias: null };
  const [mes, ano] = partes;
  const dia = Math.min(parseInt(diaVencimento ?? '1', 10) || 1, 28);
  const ultimoPagamento = new Date(parseInt(ano), parseInt(mes) - 1, dia);
  if (isNaN(ultimoPagamento.getTime())) return { dataInativo: null, dias: null };
  const dias = Math.floor((Date.now() - ultimoPagamento.getTime()) / (1000 * 60 * 60 * 24));
  return { dataInativo: ultimoPagamento.toISOString(), dias };
}

export async function GET() {
  const gerado_em = new Date().toISOString();

  try {
    const config = lerSituacoesConfig();

    if (config.codigos_inativos.length === 0) {
      return NextResponse.json({
        total: 0,
        veiculos: [],
        gerado_em,
        aviso: 'Nenhuma situação marcada como inativa. Acesse Configurações > Situações Inativas para definir quais situações do SGA devem ser monitoradas.',
      });
    }

    const todasSituacoes = await listarSituacoesVeiculo();
    const situacoesInativas = todasSituacoes.filter(s =>
      config.codigos_inativos.includes(s.codigo_situacao)
    );

    const todosInativos: VeiculoInativoRDV[] = [];

    for (const situacao of situacoesInativas) {
      const veiculos = await listarVeiculosPorSituacao(situacao.codigo_situacao);

      const checagens = await Promise.allSettled(
        veiculos.map(async (v) => {
          const identificador = v.placa || v.chassi;
          if (!identificador) return null;

          const statusRDV = await obterStatusVeiculo(v.placa || undefined, v.chassi || undefined);

          if (!statusRDV.existe) return null;

          const { dataInativo, dias } = calcularInativoDesde(v.mes_referente, v.dia_vencimento);
          const resultado: VeiculoInativoRDV = {
            placa: v.placa || '',
            chassi: v.chassi || '',
            modelo: v.modelo || '',
            marca: v.marca || '',
            tipo_veiculo: v.tipo || v.tipo_veiculo || String(v.codigo_tipo || v.codigo_tipo_veiculo || ''),
            situacao_sga: situacao.descricao_situacao || situacao.situacao,
            data_contrato: dataInativo,
            dias_inativo: dias,
            codigo_associado: v.codigo_associado ? Number(v.codigo_associado) : null,
            nome_associado: v.nome_associado || null,
            cpf_associado: v.cpf_associado || null,
            status_rdv: statusRDV.ativo ? 'Ativo na RDV' : 'Inativo na RDV',
          };

          return resultado;
        })
      );

      for (const r of checagens) {
        if (r.status === 'fulfilled' && r.value !== null) {
          todosInativos.push(r.value);
        }
      }
    }

    return NextResponse.json({
      total: todosInativos.length,
      veiculos: todosInativos,
      gerado_em,
    });
  } catch (error) {
    return NextResponse.json({
      total: 0,
      veiculos: [],
      gerado_em,
      erro: String(error),
    }, { status: 500 });
  }
}
