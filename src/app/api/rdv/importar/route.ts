import { NextRequest, NextResponse } from 'next/server';
import { salvarRdvLocal, RdvVeiculoLocal, RdvLocalData } from '@/lib/rdv-local';
import { registrarLog } from '@/lib/logs';

export const maxDuration = 60;

function parseDataConexao(valor: unknown): string | null {
  if (!valor) return null;
  const s = String(valor).trim();
  if (!s || s === 'Não informado') return null;
  // Formato: "YYYY-MM-DD HH:MM:SS"
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ ok: false, erro: 'Nenhum arquivo enviado' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      return NextResponse.json({ ok: false, erro: 'Formato inválido — envie um arquivo .xlsx' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Importar xlsx dinamicamente para não aumentar bundle client-side
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

    if (rows.length < 2) {
      return NextResponse.json({ ok: false, erro: 'Planilha vazia ou sem dados' }, { status: 400 });
    }

    const headers = (rows[0] as string[]).map(h => String(h).trim());
    const idx = {
      placa: headers.indexOf('Placa'),
      chassi: headers.indexOf('Chassi'),
      ultimaConexao: headers.indexOf('Última conexão no servidor'),
      bloqueio: headers.indexOf('Bloqueio'),
      cliente: headers.indexOf('Cliente'),
      cpfCnpj: headers.indexOf('CPF/CNPJ'),
    };

    if (idx.placa === -1 && idx.chassi === -1) {
      return NextResponse.json({ ok: false, erro: 'Colunas "Placa" e "Chassi" não encontradas na planilha' }, { status: 400 });
    }

    function parseStr(row: unknown[], i: number): string {
      if (i < 0 || i >= row.length) return '';
      const v = String(row[i] ?? '').trim();
      return v === 'Não informado' ? '' : v;
    }

    const veiculos: RdvVeiculoLocal[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const placa = idx.placa >= 0 ? String(row[idx.placa] ?? '').trim() : '';
      const chassi = idx.chassi >= 0 ? String(row[idx.chassi] ?? '').trim() : '';
      if (!placa && !chassi) continue;

      veiculos.push({
        placa: placa === 'Não informado' ? '' : placa,
        chassi: chassi === 'Não informado' ? '' : chassi,
        ultimaConexao: parseDataConexao(idx.ultimaConexao >= 0 ? row[idx.ultimaConexao] : null),
        bloqueio: idx.bloqueio >= 0 ? String(row[idx.bloqueio] ?? '').trim() === 'Sim' : false,
        cliente: idx.cliente >= 0 ? String(row[idx.cliente] ?? '').trim() : '',
        cpfCnpj: idx.cpfCnpj >= 0 ? String(row[idx.cpfCnpj] ?? '').trim() : '',
        imei: parseStr(row, 27),       // coluna AB (índice 27)
        serialChip: parseStr(row, 32), // coluna AG (índice 32)
        numeroChip: parseStr(row, 33), // coluna AH (índice 33)
      });
    }

    const data: RdvLocalData = {
      veiculos,
      importado_em: new Date().toISOString(),
      total: veiculos.length,
    };

    salvarRdvLocal(data);
    registrarLog(req.headers.get('x-usuario') || 'desconhecido', 'importar_rdv', `${veiculos.length} veículos — ${file.name}`);

    return NextResponse.json({ ok: true, total: veiculos.length, importado_em: data.importado_em });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: String(e) }, { status: 500 });
  }
}
