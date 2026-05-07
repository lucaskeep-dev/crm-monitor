import { NextRequest, NextResponse } from 'next/server';
import { lerCacheInativos } from '@/lib/storage';
import { consultarRdvLocal } from '@/lib/rdv-local';

function formatarDuracao(dias: number | null): string {
  if (dias === null || dias < 0) return '';
  if (dias < 30) return `${dias} dia(s)`;
  const meses = Math.floor(dias / 30);
  const diasRestantes = dias % 30;
  if (meses < 12) return diasRestantes > 0 ? `${meses} mês(es) e ${diasRestantes} dia(s)` : `${meses} mês(es)`;
  const anos = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  if (mesesRestantes > 0) return `${anos} ano(s) e ${mesesRestantes} mês(es)`;
  return `${anos} ano(s)`;
}

function csvEscapar(v: string | null | undefined): string {
  const s = v ?? '';
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mesesMinimo = parseInt(params.get('mesesMinimo') ?? '0', 10) || 0;

  const cache = lerCacheInativos();
  if (!cache?.veiculos?.length) {
    return NextResponse.json({ ok: false, erro: 'Nenhum dado de inativos disponível. Execute o relatório primeiro.' }, { status: 404 });
  }

  const diasMinimo = mesesMinimo * 30;
  const filtrados = cache.veiculos.filter(v => {
    if (mesesMinimo <= 0) return true;
    return (v.dias_inativo ?? 0) >= diasMinimo;
  });

  const headers = ['Placa', 'Nome', 'Tempo Inativo', 'IMEI', 'Serial Chip', 'Número Chip', 'Última Conexão'];
  const linhas: string[] = [headers.join(',')];

  for (const v of filtrados) {
    const rdv = consultarRdvLocal(v.placa || undefined, v.chassi || undefined);
    const local = rdv.encontrado ? rdv.veiculo! : null;

    const ultimaConexao = local?.ultimaConexao
      ? new Date(local.ultimaConexao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : '';

    linhas.push([
      csvEscapar(v.placa || v.chassi),
      csvEscapar(v.nome_associado),
      csvEscapar(formatarDuracao(v.dias_inativo)),
      csvEscapar(local?.imei),
      csvEscapar(local?.serialChip),
      csvEscapar(local?.numeroChip),
      csvEscapar(ultimaConexao),
    ].join(','));
  }

  const csv = '﻿' + linhas.join('\r\n'); // BOM para Excel reconhecer UTF-8
  const fileName = `inativos${mesesMinimo > 0 ? `_min${mesesMinimo}meses` : ''}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
