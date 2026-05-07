'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  AlertTriangle, CarFront, ChevronDown, ChevronUp, Clock, Search,
  CheckCircle2, XCircle, Loader2, Database, WifiOff, Zap, Activity, Terminal,
  Send, X, Mail, MessageCircle, ExternalLink, Upload, Download,
} from 'lucide-react';
import {
  RelatorioInativos, RelatorioAusentes, RelatorioSemPontuar,
  VeiculoInativoRDV, VeiculoAusenteRDV, VeiculoSemPontuar,
  ConfigMensagens, ResultadoEnvio,
} from '@/types';

interface LogLine { id: number; tipo: 'log' | 'erro' | 'concluido' | 'aviso'; msg: string; }
interface RdvProgresso { verificados: number; total: number; encontrados: number; }

type Aba = 'inativos' | 'ausentes' | 'sem_pontuar';

// ============================================================================
// Helpers
// ============================================================================
function formatarMoeda(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function formatarDias(d: number | null) {
  if (d === null) return '—';
  if (d < 30) return `${d} dia${d !== 1 ? 's' : ''}`;
  if (d < 365) { const n = Math.floor(d / 30); return `${n} ${n !== 1 ? 'meses' : 'mês'}`; }
  let a = Math.floor(d / 365); let m = Math.floor((d % 365) / 30);
  if (m >= 12) { a++; m = 0; }
  return m > 0 ? `${a} ano${a > 1 ? 's' : ''} e ${m} ${m > 1 ? 'meses' : 'mês'}` : `${a} ano${a > 1 ? 's' : ''}`;
}

function formatarMeses(m: number | null) {
  if (m === null) return '—';
  if (m < 1) return 'menos de 1 mês';
  if (m < 12) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
  const a = Math.floor(m / 12); const r = m % 12;
  return r > 0 ? `${a} ano${a > 1 ? 's' : ''} e ${r} ${r > 1 ? 'meses' : 'mês'}` : `${a} ano${a > 1 ? 's' : ''}`;
}

function formatarDataHora(iso: string | null) { return iso ? new Date(iso).toLocaleString('pt-BR') : '—'; }

function formatarHaTempo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h${h === 1 ? '' : ''}`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

// ============================================================================
// UI primitives
// ============================================================================
function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="pl-9 pr-4 py-2 w-full sm:w-96 border border-blue-500/20 rounded-lg text-sm bg-white/5 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 backdrop-blur"
      />
    </div>
  );
}

function Badge({ children, color = 'zen' }: {
  children: React.ReactNode; color?: 'zen' | 'red' | 'orange' | 'violet' | 'amber' | 'emerald' | 'slate';
}) {
  const map = {
    zen: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    red: 'bg-red-500/10 text-red-300 border-red-500/20',
    orange: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    slate: 'bg-white/5 text-gray-400 border-white/10',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${map[color]}`}>{children}</span>;
}

// ============================================================================
// Tabela base
// ============================================================================
function ThCell<T>({ campo, label, ordenacao, toggle }: {
  campo: keyof T; label: string;
  ordenacao: { campo: keyof T; dir: 'asc' | 'desc' };
  toggle: (c: keyof T) => void;
}) {
  const ativo = ordenacao.campo === campo;
  return (
    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none transition-colors"
        onClick={() => toggle(campo)}>
      <span className="flex items-center gap-1">{label}
        {ativo ? (ordenacao.dir === 'asc' ? <ChevronUp size={11} className="text-blue-400" /> : <ChevronDown size={11} className="text-blue-400" />)
          : <span className="opacity-30"><ChevronDown size={11} /></span>}
      </span>
    </th>
  );
}

// ============================================================================
// Coluna com menu de ordenação + filtro por valor
// ============================================================================
function ColunaFiltravel<T>({ campo, label, ordenacao, setOrdenacao, filtro, setFiltro, valoresUnicos }: {
  campo: keyof T; label: string;
  ordenacao: { campo: keyof T; dir: 'asc' | 'desc' };
  setOrdenacao: (o: { campo: keyof T; dir: 'asc' | 'desc' }) => void;
  filtro: Set<string>;
  setFiltro: (f: Set<string>) => void;
  valoresUnicos: string[];
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef<HTMLTableCellElement>(null);
  const ativo = ordenacao.campo === campo;
  const temFiltro = filtro.size > 0;

  useEffect(() => {
    if (!aberto) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  const valoresFilt = valoresUnicos
    .filter(v => !busca || v.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => {
      const sa = filtro.has(a) ? 0 : 1;
      const sb = filtro.has(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.localeCompare(b, 'pt-BR');
    });

  function toggleVal(v: string) {
    const n = new Set(filtro);
    n.has(v) ? n.delete(v) : n.add(v);
    setFiltro(n);
  }

  return (
    <th ref={ref} className="relative px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider select-none">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className={`flex items-center gap-1.5 transition-colors ${aberto || temFiltro ? 'text-blue-300' : 'hover:text-gray-200'}`}
      >
        <span>{label}</span>
        {temFiltro && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-[14px] px-1 rounded text-[9px] font-bold bg-blue-600 text-white">{filtro.size}</span>
        )}
        {ativo
          ? (ordenacao.dir === 'asc'
              ? <ChevronUp size={11} className="text-blue-400" />
              : <ChevronDown size={11} className="text-blue-400" />)
          : <ChevronDown size={11} className={aberto ? 'opacity-80' : 'opacity-30'} />}
      </button>

      {aberto && (
        <div className="absolute z-50 left-0 mt-2 w-72 bg-[#0b0f1a] border border-blue-500/30 rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="px-2 py-2 border-b border-blue-500/15 flex gap-1">
            <button
              type="button"
              onClick={() => setOrdenacao({ campo, dir: 'asc' })}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border transition-colors normal-case tracking-normal ${
                ativo && ordenacao.dir === 'asc'
                  ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                  : 'bg-white/5 text-gray-400 border-blue-500/15 hover:text-blue-300 hover:border-blue-500/30'
              }`}
            >
              <ChevronUp size={11} /> Crescente
            </button>
            <button
              type="button"
              onClick={() => setOrdenacao({ campo, dir: 'desc' })}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-medium border transition-colors normal-case tracking-normal ${
                ativo && ordenacao.dir === 'desc'
                  ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                  : 'bg-white/5 text-gray-400 border-blue-500/15 hover:text-blue-300 hover:border-blue-500/30'
              }`}
            >
              <ChevronDown size={11} /> Decrescente
            </button>
          </div>

          <div className="p-2 border-b border-blue-500/10 space-y-2">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Filtrar valores..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="pl-6 pr-2 py-1.5 w-full text-xs bg-black/30 border border-blue-500/15 rounded text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 normal-case tracking-normal font-normal"
              />
            </div>
            <div className="flex justify-between text-[10px] normal-case tracking-normal font-normal">
              <button
                type="button"
                onClick={() => setFiltro(new Set(valoresFilt))}
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                {busca ? 'Selecionar filtrados' : 'Selecionar todos'}
              </button>
              <button
                type="button"
                onClick={() => setFiltro(new Set())}
                className="text-gray-500 hover:text-gray-300"
              >
                Limpar
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {valoresFilt.length === 0 ? (
              <p className="text-[11px] text-gray-500 text-center py-4 normal-case tracking-normal font-normal">Nenhum valor</p>
            ) : valoresFilt.map(v => {
              const a = filtro.has(v);
              return (
                <label
                  key={v}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-[11px] normal-case tracking-normal font-normal transition-colors ${
                    a ? 'bg-blue-500/10 text-blue-200' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={a}
                    onChange={() => toggleVal(v)}
                    className="w-3.5 h-3.5 flex-shrink-0"
                  />
                  <span className="truncate flex-1" title={v || ''}>{v || '—'}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </th>
  );
}

// ============================================================================
// TABELA INATIVOS
// ============================================================================
function TabelaInativos({ veiculos }: { veiculos: VeiculoInativoRDV[] }) {
  const [busca, setBusca] = useState('');
  const [ord, setOrd] = useState<{ campo: keyof VeiculoInativoRDV; dir: 'asc' | 'desc' }>({ campo: 'dias_inativo', dir: 'desc' });
  const [filtroVeiculo, setFiltroVeiculo] = useState<Set<string>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<Set<string>>(new Set());
  const [filtroSituacao, setFiltroSituacao] = useState<Set<string>>(new Set());
  const [mesesMinCSV, setMesesMinCSV] = useState(0);
  const [exportando, setExportando] = useState(false);

  const valoresVeiculo = useMemo(
    () => Array.from(new Set(veiculos.map(v => v.modelo).filter((s): s is string => Boolean(s)))),
    [veiculos]
  );
  const valoresTipo = useMemo(
    () => Array.from(new Set(veiculos.map(v => v.tipo_veiculo).filter((s): s is string => Boolean(s)))),
    [veiculos]
  );
  const valoresSituacao = useMemo(
    () => Array.from(new Set(veiculos.map(v => v.situacao_sga).filter((s): s is string => Boolean(s)))),
    [veiculos]
  );

  const filtrados = veiculos.filter(v => {
    if (filtroVeiculo.size > 0 && !filtroVeiculo.has(v.modelo || '')) return false;
    if (filtroTipo.size > 0 && !filtroTipo.has(v.tipo_veiculo || '')) return false;
    if (filtroSituacao.size > 0 && !filtroSituacao.has(v.situacao_sga || '')) return false;
    const t = busca.toLowerCase();
    if (!t) return true;
    return v.placa?.toLowerCase().includes(t) || v.modelo?.toLowerCase().includes(t)
      || v.marca?.toLowerCase().includes(t) || v.nome_associado?.toLowerCase().includes(t) || v.cpf_associado?.includes(t);
  }).sort((a, b) => {
    const va = a[ord.campo] ?? ''; const vb = b[ord.campo] ?? '';
    const m = ord.dir === 'asc' ? 1 : -1; return va < vb ? -m : va > vb ? m : 0;
  });
  const toggle = (c: keyof VeiculoInativoRDV) => setOrd(o => ({ campo: c, dir: o.campo === c && o.dir === 'asc' ? 'desc' : 'asc' }));

  async function exportarCSV() {
    setExportando(true);
    try {
      const url = `/api/relatorio/inativos/exportar-csv${mesesMinCSV > 0 ? `?mesesMinimo=${mesesMinCSV}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ erro: 'Erro ao gerar CSV' }));
        alert(err.erro || 'Erro ao gerar CSV');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'inativos.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]"><SearchInput value={busca} onChange={setBusca} placeholder="Buscar por placa, modelo, nome ou CPF..." /></div>
        <div className="flex items-center gap-2">
          <select
            value={mesesMinCSV}
            onChange={e => setMesesMinCSV(Number(e.target.value))}
            className="text-sm bg-white/[0.06] border border-blue-500/20 rounded-lg px-3 py-2 text-gray-300 focus:outline-none focus:border-blue-500/40"
          >
            <option value={0}>Todos os meses</option>
            <option value={1}>Mín. 1 mês</option>
            <option value={3}>Mín. 3 meses</option>
            <option value={6}>Mín. 6 meses</option>
            <option value={12}>Mín. 12 meses</option>
            <option value={24}>Mín. 24 meses</option>
          </select>
          <button
            onClick={exportarCSV}
            disabled={exportando || veiculos.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600/80 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white"
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exportando ? 'Gerando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-blue-500/10 bg-white/[0.02] backdrop-blur">
        <table className="min-w-full divide-y divide-blue-500/10">
          <thead className="bg-white/[0.03]">
            <tr>
              <ThCell campo="placa" label="Placa" ordenacao={ord} toggle={toggle} />
              <ColunaFiltravel<VeiculoInativoRDV> campo="modelo" label="Veículo" ordenacao={ord} setOrdenacao={setOrd} filtro={filtroVeiculo} setFiltro={setFiltroVeiculo} valoresUnicos={valoresVeiculo} />
              <ColunaFiltravel<VeiculoInativoRDV> campo="tipo_veiculo" label="Tipo" ordenacao={ord} setOrdenacao={setOrd} filtro={filtroTipo} setFiltro={setFiltroTipo} valoresUnicos={valoresTipo} />
              <ColunaFiltravel<VeiculoInativoRDV> campo="situacao_sga" label="Situação SGA" ordenacao={ord} setOrdenacao={setOrd} filtro={filtroSituacao} setFiltro={setFiltroSituacao} valoresUnicos={valoresSituacao} />
              <ThCell campo="dias_inativo" label="Tempo inativo" ordenacao={ord} toggle={toggle} />
              <ThCell campo="nome_associado" label="Associado" ordenacao={ord} toggle={toggle} />
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-500/5">
            {filtrados.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">Nenhum veículo encontrado</td></tr>
            ) : filtrados.map((v, i) => (
              <tr key={i} className="hover:bg-blue-500/5 transition-colors">
                <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-300">{v.placa || '—'}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="text-gray-200">{v.modelo || '—'}</div>
                  <div className="text-xs text-gray-500">{v.marca}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{v.tipo_veiculo || '—'}</td>
                <td className="px-4 py-3"><Badge color="red">{v.situacao_sga}</Badge></td>
                <td className="px-4 py-3 text-sm text-gray-300"><div className="flex items-center gap-1 tabular-nums"><Clock size={13} className="text-orange-400" />{formatarDias(v.dias_inativo)}</div></td>
                <td className="px-4 py-3 text-sm">
                  <div className="text-gray-200">{v.nome_associado || '—'}</div>
                  <div className="text-xs text-gray-500 font-mono">{v.cpf_associado}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500 font-mono">{filtrados.length} / {veiculos.length}</p>
    </div>
  );
}

// ============================================================================
// TABELA AUSENTES
// ============================================================================
function TabelaAusentes({ veiculos, ignorados, onIgnorar, onDesignorar }: {
  veiculos: VeiculoAusenteRDV[];
  ignorados: Set<string>;
  onIgnorar: (placas: string[]) => void;
  onDesignorar: (placas: string[]) => void;
}) {
  const [busca, setBusca] = useState('');
  const [buscaIgn, setBuscaIgn] = useState('');
  const [ord, setOrd] = useState<{ campo: keyof VeiculoAusenteRDV; dir: 'asc' | 'desc' }>({ campo: 'valor_fipe', dir: 'desc' });
  const [filtroVeiculo, setFiltroVeiculo] = useState<Set<string>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<Set<string>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'lista' | 'ignorados'>('lista');

  const valoresVeiculo = useMemo(
    () => Array.from(new Set(veiculos.map(v => v.modelo).filter((s): s is string => Boolean(s)))),
    [veiculos]
  );
  const valoresTipo = useMemo(
    () => Array.from(new Set(veiculos.map(v => v.tipo_veiculo).filter((s): s is string => Boolean(s)))),
    [veiculos]
  );

  const visiveis = veiculos.filter(v => !ignorados.has((v.placa || '').toUpperCase()));
  const ignoradosList = veiculos.filter(v => ignorados.has((v.placa || '').toUpperCase()));

  const filtrados = visiveis.filter(v => {
    if (filtroVeiculo.size > 0 && !filtroVeiculo.has(v.modelo || '')) return false;
    if (filtroTipo.size > 0 && !filtroTipo.has(v.tipo_veiculo || '')) return false;
    const t = busca.toLowerCase();
    if (!t) return true;
    return v.placa?.toLowerCase().includes(t) || v.modelo?.toLowerCase().includes(t)
      || v.marca?.toLowerCase().includes(t) || v.nome_associado?.toLowerCase().includes(t) || v.cpf_associado?.includes(t);
  }).sort((a, b) => {
    const va = a[ord.campo] ?? ''; const vb = b[ord.campo] ?? '';
    const m = ord.dir === 'asc' ? 1 : -1; return va < vb ? -m : va > vb ? m : 0;
  });
  const toggle = (c: keyof VeiculoAusenteRDV) => setOrd(o => ({ campo: c, dir: o.campo === c && o.dir === 'asc' ? 'desc' : 'asc' }));

  const toggleSel = (placa: string) => setSelecionados(s => {
    const n = new Set(s); n.has(placa) ? n.delete(placa) : n.add(placa); return n;
  });
  const toggleTodos = () => {
    if (selecionados.size === filtrados.length) setSelecionados(new Set());
    else setSelecionados(new Set(filtrados.map(v => v.placa || '')));
  };

  const handleIgnorar = () => {
    const placas = Array.from(selecionados).filter(Boolean);
    if (!placas.length) return;
    onIgnorar(placas);
    setSelecionados(new Set());
  };

  // Lista de ignorados com dados do veículo quando disponível
  const ignoradosComDados = Array.from(ignorados).map(placa => ({
    placa,
    veiculo: veiculos.find(v => (v.placa || '').toUpperCase() === placa),
  })).filter(i => {
    if (!buscaIgn) return true;
    const t = buscaIgn.toLowerCase();
    return i.placa.toLowerCase().includes(t) ||
      i.veiculo?.modelo?.toLowerCase().includes(t) ||
      i.veiculo?.nome_associado?.toLowerCase().includes(t) ||
      i.veiculo?.cpf_associado?.includes(t);
  });

  return (
    <div>
      {/* Sub-menu */}
      <div className="mb-4 flex items-center gap-1 border-b border-blue-500/10 pb-0">
        <button onClick={() => setView('lista')}
          className={`px-4 py-2 text-sm font-medium transition-all relative ${view === 'lista' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>
          Sem rastreador
          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${view === 'lista' ? 'bg-orange-500/20 text-orange-300' : 'bg-white/5 text-gray-500'}`}>{visiveis.length}</span>
          {view === 'lista' && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full" />}
        </button>
        <button onClick={() => setView('ignorados')}
          className={`px-4 py-2 text-sm font-medium transition-all relative ${view === 'ignorados' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>
          Ignorados
          {ignorados.size > 0 && <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${view === 'ignorados' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-gray-500'}`}>{ignorados.size}</span>}
          {view === 'ignorados' && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full" />}
        </button>
      </div>

      {/* VIEW: lista principal */}
      {view === 'lista' && (
        <div>
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por placa, modelo, nome ou CPF..." />
            </div>
            {selecionados.size > 0 && (
              <button onClick={handleIgnorar}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm font-semibold hover:bg-amber-500/25 transition-colors">
                <X size={14} />
                Ignorar {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-blue-500/10 bg-white/[0.02] backdrop-blur">
            <table className="min-w-full divide-y divide-blue-500/10">
              <thead className="bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 w-8" />
                  <ThCell campo="placa" label="Placa" ordenacao={ord} toggle={toggle} />
                  <ColunaFiltravel<VeiculoAusenteRDV> campo="modelo" label="Veículo" ordenacao={ord} setOrdenacao={setOrd} filtro={filtroVeiculo} setFiltro={setFiltroVeiculo} valoresUnicos={valoresVeiculo} />
                  <ColunaFiltravel<VeiculoAusenteRDV> campo="tipo_veiculo" label="Tipo" ordenacao={ord} setOrdenacao={setOrd} filtro={filtroTipo} setFiltro={setFiltroTipo} valoresUnicos={valoresTipo} />
                  <ThCell campo="valor_fipe" label="Valor FIPE" ordenacao={ord} toggle={toggle} />
                  <ThCell campo="meses_ativo" label="Tempo ativo" ordenacao={ord} toggle={toggle} />
                  <ThCell campo="nome_associado" label="Associado" ordenacao={ord} toggle={toggle} />
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-500/5">
                {filtrados.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">Nenhum veículo encontrado</td></tr>
                ) : filtrados.map((v, i) => {
                  const sel = selecionados.has(v.placa || '');
                  return (
                    <tr key={i} onClick={() => toggleSel(v.placa || '')}
                      className={`cursor-pointer transition-colors ${sel ? 'bg-amber-500/8 hover:bg-amber-500/12' : 'hover:bg-blue-500/5'}`}>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={sel} onChange={() => toggleSel(v.placa || '')}
                          className="rounded border-gray-600 bg-transparent accent-orange-400 cursor-pointer" />
                      </td>
                      <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-300">{v.placa || '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-gray-200">{v.modelo || '—'}</div>
                        <div className="text-xs text-gray-500">{v.marca}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{v.tipo_veiculo || '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-100 tabular-nums">{formatarMoeda(v.valor_fipe)}</td>
                      <td className="px-4 py-3 text-sm text-gray-300"><div className="flex items-center gap-1 tabular-nums"><Clock size={13} className="text-blue-400" />{formatarMeses(v.meses_ativo)}</div></td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-gray-200">{v.nome_associado || '—'}</div>
                        <div className="text-xs text-gray-500 font-mono">{v.cpf_associado}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500 font-mono">{filtrados.length} / {visiveis.length}</p>
        </div>
      )}

      {/* VIEW: ignorados */}
      {view === 'ignorados' && (
        <div>
          <div className="mb-4">
            <SearchInput value={buscaIgn} onChange={setBuscaIgn} placeholder="Buscar por placa, modelo, nome ou CPF..." />
          </div>
          {ignorados.size === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">Nenhuma placa ignorada</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-amber-500/15 bg-white/[0.02] backdrop-blur">
              <table className="min-w-full divide-y divide-amber-500/10">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Placa</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Veículo</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Valor FIPE</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Associado</th>
                    <th className="px-4 py-3 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-500/5">
                  {ignoradosComDados.map(({ placa, veiculo: v }) => (
                    <tr key={placa} className="hover:bg-amber-500/5 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono font-semibold text-amber-300">{placa}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-gray-300">{v?.modelo || '—'}</div>
                        <div className="text-xs text-gray-500">{v?.marca}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{v?.tipo_veiculo || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-300 tabular-nums">{v ? formatarMoeda(v.valor_fipe) : '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="text-gray-300">{v?.nome_associado || '—'}</div>
                        <div className="text-xs text-gray-500 font-mono">{v?.cpf_associado}</div>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => onDesignorar([placa])}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors">
                          <X size={11} /> Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500 font-mono">{ignoradosComDados.length} / {ignorados.size} ignorado{ignorados.size !== 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TABELA SEM PONTUAR
// ============================================================================
function TabelaSemPontuar({ veiculos, selecionados, setSelecionados }: {
  veiculos: VeiculoSemPontuar[];
  selecionados: Set<string>;
  setSelecionados: (s: Set<string>) => void;
}) {
  const [busca, setBusca] = useState('');
  const [ord, setOrd] = useState<{ campo: keyof VeiculoSemPontuar; dir: 'asc' | 'desc' }>({ campo: 'dias_sem_pontuar', dir: 'desc' });
  const [filtroVeiculo, setFiltroVeiculo] = useState<Set<string>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<Set<string>>(new Set());
  const [filtroSituacao, setFiltroSituacao] = useState<Set<string>>(new Set());

  const valoresVeiculo = useMemo(
    () => Array.from(new Set(veiculos.map(v => v.modelo).filter((s): s is string => Boolean(s)))),
    [veiculos]
  );
  const valoresTipo = useMemo(
    () => Array.from(new Set(veiculos.map(v => v.tipo_veiculo).filter((s): s is string => Boolean(s)))),
    [veiculos]
  );
  const valoresSituacao = useMemo(
    () => Array.from(new Set(veiculos.map(v => v.situacao_sga).filter((s): s is string => Boolean(s)))),
    [veiculos]
  );

  const filtrados = veiculos.filter(v => {
    if (filtroVeiculo.size > 0 && !filtroVeiculo.has(v.modelo || '')) return false;
    if (filtroTipo.size > 0 && !filtroTipo.has(v.tipo_veiculo || '')) return false;
    if (filtroSituacao.size > 0 && !filtroSituacao.has(v.situacao_sga || '')) return false;
    const t = busca.toLowerCase();
    if (!t) return true;
    return v.placa?.toLowerCase().includes(t) || v.modelo?.toLowerCase().includes(t)
      || v.marca?.toLowerCase().includes(t) || v.nome_associado?.toLowerCase().includes(t)
      || v.cpf_associado?.includes(t) || v.situacao_sga?.toLowerCase().includes(t);
  }).sort((a, b) => {
    const va = a[ord.campo] ?? ''; const vb = b[ord.campo] ?? '';
    const m = ord.dir === 'asc' ? 1 : -1; return va < vb ? -m : va > vb ? m : 0;
  });
  const toggle = (c: keyof VeiculoSemPontuar) => setOrd(o => ({ campo: c, dir: o.campo === c && o.dir === 'asc' ? 'desc' : 'asc' }));

  function toggleLinha(placa: string) {
    const n = new Set(selecionados);
    n.has(placa) ? n.delete(placa) : n.add(placa);
    setSelecionados(n);
  }

  const placasFiltradas = filtrados.map(v => v.placa).filter(Boolean);
  const todasFiltradasSelecionadas = placasFiltradas.length > 0 && placasFiltradas.every(p => selecionados.has(p));
  function toggleTodas() {
    const n = new Set(selecionados);
    if (todasFiltradasSelecionadas) placasFiltradas.forEach(p => n.delete(p));
    else placasFiltradas.forEach(p => n.add(p));
    setSelecionados(n);
  }

  return (
    <div>
      <div className="mb-4"><SearchInput value={busca} onChange={setBusca} placeholder="Buscar por placa, modelo, nome, CPF ou situação..." /></div>
      <div className="overflow-x-auto rounded-xl border border-blue-500/10 bg-white/[0.02] backdrop-blur">
        <table className="min-w-full divide-y divide-blue-500/10">
          <thead className="bg-white/[0.03]">
            <tr>
              <th className="px-3 py-3 w-10">
                <input type="checkbox" className="w-4 h-4 rounded" checked={todasFiltradasSelecionadas}
                  onChange={toggleTodas} aria-label="Selecionar todos" />
              </th>
              <ThCell campo="placa" label="Placa" ordenacao={ord} toggle={toggle} />
              <ColunaFiltravel<VeiculoSemPontuar> campo="modelo" label="Veículo" ordenacao={ord} setOrdenacao={setOrd} filtro={filtroVeiculo} setFiltro={setFiltroVeiculo} valoresUnicos={valoresVeiculo} />
              <ColunaFiltravel<VeiculoSemPontuar> campo="tipo_veiculo" label="Tipo" ordenacao={ord} setOrdenacao={setOrd} filtro={filtroTipo} setFiltro={setFiltroTipo} valoresUnicos={valoresTipo} />
              <ColunaFiltravel<VeiculoSemPontuar> campo="situacao_sga" label="Situação" ordenacao={ord} setOrdenacao={setOrd} filtro={filtroSituacao} setFiltro={setFiltroSituacao} valoresUnicos={valoresSituacao} />
              <ThCell campo="ultima_pontuacao" label="Último ponto" ordenacao={ord} toggle={toggle} />
              <ThCell campo="dias_sem_pontuar" label="Sem pontuar" ordenacao={ord} toggle={toggle} />
              <ThCell campo="nome_associado" label="Associado" ordenacao={ord} toggle={toggle} />
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-500/5">
            {filtrados.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500 text-sm">Nenhum veículo encontrado</td></tr>
            ) : filtrados.map((v, i) => {
              const sel = selecionados.has(v.placa);
              return (
              <tr key={i} className={`transition-colors ${sel ? 'bg-blue-500/10 hover:bg-blue-500/15' : 'hover:bg-blue-500/5'}`}>
                <td className="px-3 py-3 w-10">
                  <input type="checkbox" className="w-4 h-4 rounded" checked={sel}
                    onChange={() => toggleLinha(v.placa)} aria-label={`Selecionar ${v.placa}`} />
                </td>
                <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-300">{v.placa || '—'}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="text-gray-200">{v.modelo || '—'}</div>
                  <div className="text-xs text-gray-500">{v.marca}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{v.tipo_veiculo || '—'}</td>
                <td className="px-4 py-3"><Badge color="zen">{v.situacao_sga || '—'}</Badge></td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono tabular-nums">{formatarDataHora(v.ultima_pontuacao)}</td>
                <td className="px-4 py-3">
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border tabular-nums ${
                    v.dias_sem_pontuar !== null && v.dias_sem_pontuar >= 90 ? 'bg-red-500/10 text-red-300 border-red-500/20'
                    : v.dias_sem_pontuar !== null && v.dias_sem_pontuar >= 30 ? 'bg-orange-500/10 text-orange-300 border-orange-500/20'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                  }`}>
                    <Clock size={11} />{formatarDias(v.dias_sem_pontuar)}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="text-gray-200">{v.nome_associado || '—'}</div>
                  <div className="text-xs text-gray-500 font-mono">{v.cpf_associado}</div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500 font-mono">{filtrados.length} / {veiculos.length}</p>
    </div>
  );
}

// ============================================================================
// Terminal de logs
// ============================================================================
function LogTerminal({ logs, carregando, logEndRef }: {
  logs: LogLine[]; carregando: boolean; logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (logs.length === 0) return null;
  return (
    <div className="mb-4 terminal rounded-xl p-4 font-mono text-xs max-h-56 overflow-y-auto">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-blue-500/20">
        <Terminal size={12} className="text-blue-400" />
        <span className="text-blue-300/80 text-[10px] uppercase tracking-[0.15em]">process · log</span>
        <span className="ml-auto flex gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500/60" />
          <span className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <span className="w-2 h-2 rounded-full bg-green-500/60" />
        </span>
      </div>
      {logs.map(l => (
        <div key={l.id} className="flex items-start gap-2 mb-1">
          {l.tipo === 'concluido' && <CheckCircle2 size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />}
          {l.tipo === 'erro' && <XCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />}
          {l.tipo === 'aviso' && <AlertTriangle size={13} className="text-yellow-400 mt-0.5 flex-shrink-0" />}
          {l.tipo === 'log' && <span className="text-blue-500 flex-shrink-0 mt-0.5">›</span>}
          <span className={
            l.tipo === 'concluido' ? 'text-emerald-300' :
            l.tipo === 'erro' ? 'text-red-300' :
            l.tipo === 'aviso' ? 'text-yellow-300' : 'text-gray-300'
          }>{l.msg}</span>
        </div>
      ))}
      {carregando && (
        <div className="flex items-center gap-2 mt-2 text-blue-400">
          <Loader2 size={13} className="animate-spin flex-shrink-0" />
          <span>processando</span>
          <span className="inline-block w-2 h-3 bg-blue-400 animate-pulse" />
        </div>
      )}
      <div ref={logEndRef} />
    </div>
  );
}

// ============================================================================
// Hooks de streaming
// ============================================================================
function useStreamRelatorio(endpoint: string) {
  const [carregando, setCarregando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioInativos | RelatorioAusentes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progresso, setProgresso] = useState<RdvProgresso | null>(null);
  const [doCache, setDoCache] = useState(false);
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  function addLog(tipo: LogLine['tipo'], msg: string) {
    const id = ++logIdRef.current;
    setLogs(prev => [...prev, { id, tipo, msg }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  const executar = useCallback(async () => {
    setCarregando(true); setErro(null); setLogs([]); setProgresso(null); setRelatorio(null); setDoCache(false);
    try {
      const res = await fetch(endpoint);
      if (!res.body) throw new Error('Stream não suportado');
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.tipo === 'log') addLog('log', event.msg);
            else if (event.tipo === 'aviso') addLog('aviso', event.msg);
            else if (event.tipo === 'erro') { addLog('erro', event.msg); setErro(event.msg); }
            else if (event.tipo === 'rdv_progresso') setProgresso(event);
            else if (event.tipo === 'concluido') {
              addLog('concluido', `Concluído — ${event.total} veículo(s) encontrado(s)`);
              setRelatorio({ total: event.total, veiculos: event.veiculos, gerado_em: event.gerado_em });
            }
          } catch { /* noop */ }
        }
      }
    } catch (e) { setErro(String(e)); addLog('erro', String(e)); }
    finally { setCarregando(false); setProgresso(null); }
  }, [endpoint]);

  return { carregando, relatorio, erro, logs, progresso, doCache, setRelatorio, setDoCache, executar, logEndRef };
}

function useStreamSemPontuar() {
  const [carregando, setCarregando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioSemPontuar | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progresso, setProgresso] = useState<RdvProgresso | null>(null);
  const [doCache, setDoCache] = useState(false);
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  function addLog(tipo: LogLine['tipo'], msg: string) {
    const id = ++logIdRef.current;
    setLogs(prev => [...prev, { id, tipo, msg }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  const executar = useCallback(async (dias: number) => {
    setCarregando(true); setErro(null); setLogs([]); setProgresso(null); setRelatorio(null); setDoCache(false);
    const params = new URLSearchParams({ dias: String(dias) });
    try {
      const res = await fetch(`/api/relatorio/sem-pontuar/stream?${params}`);
      if (!res.body) throw new Error('Stream não suportado');
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.tipo === 'log') addLog('log', event.msg);
            else if (event.tipo === 'aviso') addLog('aviso', event.msg);
            else if (event.tipo === 'erro') { addLog('erro', event.msg); setErro(event.msg); }
            else if (event.tipo === 'rdv_progresso') setProgresso(event);
            else if (event.tipo === 'concluido') {
              addLog('concluido', `Concluído — ${event.total} veículo(s) encontrado(s)`);
              setRelatorio({
                total: event.total, veiculos: event.veiculos, gerado_em: event.gerado_em,
                dias_filtro: event.dias_filtro, situacoes_filtro: event.situacoes_filtro,
              });
            }
          } catch { /* noop */ }
        }
      }
    } catch (e) { setErro(String(e)); addLog('erro', String(e)); }
    finally { setCarregando(false); setProgresso(null); }
  }, []);

  return { carregando, relatorio, erro, logs, progresso, doCache, setRelatorio, setDoCache, executar, logEndRef };
}

// ============================================================================
// Modal de envio de mensagens
// ============================================================================
function ModalEnviarMensagens({
  veiculos, aberto, onClose,
}: {
  veiculos: VeiculoSemPontuar[];
  aberto: boolean;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<ConfigMensagens | null>(null);
  const [canais, setCanais] = useState<Set<'whatsapp' | 'email'>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoEnvio[]>([]);
  const [progresso, setProgresso] = useState<{ processados: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    fetch('/api/config-mensagens').then(r => r.json()).then(setConfig).catch(() => {});
    setResultados([]);
    setProgresso(null);
    setErro(null);
    setConcluido(false);
    setEnviando(false);
    setCanais(new Set());
  }, [aberto]);

  async function executar() {
    if (!config || canais.size === 0 || veiculos.length === 0) return;
    setEnviando(true);
    setErro(null);
    setResultados([]);
    setProgresso({ processados: 0, total: veiculos.length });
    setConcluido(false);

    try {
      const res = await fetch('/api/enviar-mensagens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canais: Array.from(canais),
          veiculos: veiculos.map(v => ({
            placa: v.placa, chassi: v.chassi, modelo: v.modelo, marca: v.marca,
            nome_associado: v.nome_associado, dias_sem_pontuar: v.dias_sem_pontuar,
            ultima_pontuacao: v.ultima_pontuacao,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.erro || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error('Stream não suportado');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.tipo === 'resultado') {
              setResultados(p => [...p, ev.resultado]);
              setProgresso({ processados: ev.processados, total: ev.total });
            } else if (ev.tipo === 'concluido') {
              setConcluido(true);
            } else if (ev.tipo === 'erro') {
              setErro(ev.msg);
            }
          } catch { /* noop */ }
        }
      }
    } catch (e) {
      setErro(String(e));
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) return null;

  const sucWA = resultados.filter(r => r.whatsapp?.sucesso).length;
  const sucEM = resultados.filter(r => r.email?.sucesso).length;
  const falhasWA = resultados.filter(r => r.whatsapp && !r.whatsapp.sucesso).length;
  const falhasEM = resultados.filter(r => r.email && !r.email.sucesso).length;
  const podeExecutar = config !== null && canais.size > 0 && !enviando;
  const algumCanalDesabilitado =
    (canais.has('whatsapp') && config && !config.whatsapp.habilitado) ||
    (canais.has('email') && config && !config.email.habilitado);

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur flex items-center justify-center p-4" onClick={enviando ? undefined : onClose}>
      <div className="glass-strong rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-blue-500/15 flex items-center justify-between flex-shrink-0">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Send size={16} className="text-blue-400" />
            Enviar mensagens · {veiculos.length} veículo(s)
          </h3>
          <button onClick={onClose} disabled={enviando} className="text-gray-400 hover:text-white disabled:opacity-30">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!config ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
              <Loader2 size={14} className="animate-spin text-blue-400" /> Carregando configurações...
            </div>
          ) : resultados.length === 0 && !enviando ? (
            <>
              <p className="text-sm text-gray-400 mb-4">Selecione os canais para envio:</p>
              <div className="space-y-3 mb-6">
                <CanalToggle
                  label="WhatsApp"
                  icon={<MessageCircle size={16} className="text-emerald-400" />}
                  habilitado={config.whatsapp.habilitado}
                  configurado={Boolean(config.whatsapp.phone_number_id && config.whatsapp.access_token && config.whatsapp.template_name)}
                  selected={canais.has('whatsapp')}
                  onToggle={() => setCanais(p => { const n = new Set(p); n.has('whatsapp') ? n.delete('whatsapp') : n.add('whatsapp'); return n; })}
                />
                <CanalToggle
                  label="E-mail"
                  icon={<Mail size={16} className="text-blue-400" />}
                  habilitado={config.email.habilitado}
                  configurado={Boolean(config.email.smtp_host && config.email.smtp_user && config.email.from_email)}
                  selected={canais.has('email')}
                  onToggle={() => setCanais(p => { const n = new Set(p); n.has('email') ? n.delete('email') : n.add('email'); return n; })}
                />
              </div>

              {algumCanalDesabilitado && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200 flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
                  <span>Um dos canais selecionados está desabilitado. <a href="/configuracoes" className="underline hover:text-amber-100">Ir para Configurações <ExternalLink size={10} className="inline -mt-0.5" /></a></span>
                </div>
              )}

              <button onClick={executar} disabled={!podeExecutar}
                className="w-full px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-lg shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 transition-all flex items-center justify-center gap-2">
                <Zap size={15} />
                Disparar envio
              </button>
            </>
          ) : (
            <>
              {progresso && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-2 font-mono">
                    <span>{enviando ? 'Enviando...' : 'Concluído'}</span>
                    <span>{progresso.processados} / {progresso.total}</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-blue-400 h-full rounded-full transition-all"
                      style={{ width: `${Math.min((progresso.processados / progresso.total) * 100, 100)}%` }} />
                  </div>
                </div>
              )}

              {erro && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
                  <strong>Erro:</strong> {erro}
                </div>
              )}

              {concluido && (
                <div className="mb-4 grid grid-cols-2 gap-3">
                  {canais.has('whatsapp') && (
                    <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-semibold">WhatsApp</div>
                      <div className="text-sm text-gray-200 mt-1">
                        <span className="text-emerald-300 font-bold tabular-nums">{sucWA}</span> enviadas ·
                        <span className="text-red-300 font-bold tabular-nums ml-1">{falhasWA}</span> falhas
                      </div>
                    </div>
                  )}
                  {canais.has('email') && (
                    <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
                      <div className="text-[10px] uppercase tracking-wider text-blue-300/80 font-semibold">E-mail</div>
                      <div className="text-sm text-gray-200 mt-1">
                        <span className="text-emerald-300 font-bold tabular-nums">{sucEM}</span> enviados ·
                        <span className="text-red-300 font-bold tabular-nums ml-1">{falhasEM}</span> falhas
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-blue-500/10 bg-black/20 overflow-hidden">
                <div className="max-h-[40vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#0b0f1a] border-b border-blue-500/15 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-gray-500">Placa</th>
                        <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-gray-500">Contato</th>
                        {canais.has('whatsapp') && <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-gray-500">WhatsApp</th>}
                        {canais.has('email') && <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-gray-500">E-mail</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-500/5">
                      {resultados.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-blue-300 text-xs">{r.placa}</td>
                          <td className="px-3 py-2 text-[11px] text-gray-400">
                            <div className="truncate max-w-[200px]">{r.contato.nome || '—'}</div>
                            <div className="font-mono text-gray-600 truncate max-w-[200px]">
                              {r.contato.telefone || ''}{r.contato.telefone && r.contato.email ? ' · ' : ''}{r.contato.email || ''}
                            </div>
                          </td>
                          {canais.has('whatsapp') && (
                            <td className="px-3 py-2">
                              {r.whatsapp?.sucesso ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]"><CheckCircle2 size={11} />Enviado</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-400 text-[11px]" title={r.whatsapp?.erro}>
                                  <XCircle size={11} />{(r.whatsapp?.erro || 'Erro').slice(0, 30)}
                                </span>
                              )}
                            </td>
                          )}
                          {canais.has('email') && (
                            <td className="px-3 py-2">
                              {r.email?.sucesso ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]"><CheckCircle2 size={11} />Enviado</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-400 text-[11px]" title={r.email?.erro}>
                                  <XCircle size={11} />{(r.email?.erro || 'Erro').slice(0, 30)}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {!enviando && (
                <div className="mt-4 flex justify-end">
                  <button onClick={onClose} className="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-lg hover:bg-white/10 transition-colors">
                    Fechar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CanalToggle({ label, icon, habilitado, configurado, selected, onToggle }: {
  label: string; icon: React.ReactNode; habilitado: boolean; configurado: boolean; selected: boolean; onToggle: () => void;
}) {
  const indisponivel = !habilitado || !configurado;
  return (
    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
      selected ? 'bg-blue-500/10 border-blue-500/40' : 'bg-white/5 border-white/10 hover:border-blue-500/25'
    } ${indisponivel ? 'opacity-60' : ''}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="w-4 h-4 rounded" />
      {icon}
      <span className="text-sm font-medium text-gray-200 flex-1">{label}</span>
      {!configurado ? (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">Não configurado</span>
      ) : !habilitado ? (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/15 text-red-300 border border-red-500/30">Desabilitado</span>
      ) : (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Pronto</span>
      )}
    </label>
  );
}

// ============================================================================
// Painel Sem Pontuar
// ============================================================================
function PainelSemPontuar({ state, dias, setDias }: {
  state: ReturnType<typeof useStreamSemPontuar>;
  dias: number;
  setDias: (d: number) => void;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalAberto, setModalAberto] = useState(false);

  // Quando um relatório novo chega, reseta a seleção
  useEffect(() => { setSelecionados(new Set()); }, [state.relatorio]);

  const veiculosFiltrados = (state.relatorio?.veiculos ?? []).filter(v => {
    if (v.dias_sem_pontuar === null || v.dias_sem_pontuar < dias) return false;
    return true;
  });

  const veiculosSelecionados = veiculosFiltrados.filter(v => selecionados.has(v.placa));

  const vazio = !state.relatorio && !state.carregando && state.logs.length === 0;

  return (
    <div>
      {/* Config */}
      <div className="mb-6 rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-900/10 via-blue-950/20 to-transparent p-5 flex flex-wrap items-end gap-5">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-[0.15em] mb-2">Dias sem pontuar</label>
          <input type="number" min={1} max={9999} value={dias} onChange={e => setDias(Math.max(1, Number(e.target.value)))}
            className="w-32 border border-blue-500/20 bg-white/5 text-white rounded-lg px-3 py-2 text-lg font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
          <div className="mt-2 flex gap-1 flex-wrap">
            {[7, 15, 30, 60].map(v => (
              <button key={v} onClick={() => setDias(v)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                  dias === v ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/30'
                            : 'bg-white/5 text-gray-400 border-blue-500/20 hover:border-blue-400 hover:text-blue-300'
                }`}>{v}d</button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-[200px] text-xs text-gray-500">
          A consulta cobre todas as situações do SGA. Use os filtros nos cabeçalhos da tabela para refinar por veículo ou situação.
        </div>

        <button onClick={() => state.executar(dias)} disabled={state.carregando}
          className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 transition-all">
          {state.carregando ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} className="group-hover:rotate-12 transition-transform" />}
          {state.carregando ? 'Consultando...' : state.relatorio ? 'Atualizar' : 'Gerar relatório'}
        </button>
      </div>

      {state.erro && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300 backdrop-blur">
          <strong>Erro:</strong> {state.erro}
        </div>
      )}

      {state.doCache && state.relatorio && !state.carregando && (
        <div className="mb-4 flex items-center gap-2 text-xs flex-wrap">
          <Database size={13} className="text-gray-500" />
          <span className="text-gray-500">Cache · gerado em {new Date(state.relatorio.gerado_em).toLocaleString('pt-BR')}</span>
          {(state.relatorio as { status?: string }).status === 'em_progresso' && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-zen" />
              parcial · {(state.relatorio as { verificados?: number }).verificados ?? 0}/{(state.relatorio as { total_alvo?: number }).total_alvo ?? '?'} processados
            </span>
          )}
          {(state.relatorio as { status?: string }).status === 'erro' && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono">
              parcial · interrompido em {(state.relatorio as { verificados?: number }).verificados ?? 0}/{(state.relatorio as { total_alvo?: number }).total_alvo ?? '?'}
            </span>
          )}
        </div>
      )}

      {vazio && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <WifiOff size={40} className="mb-3 opacity-30" />
          <p className="text-sm">Clique em &quot;Gerar relatório&quot; para consultar</p>
          <p className="text-xs mt-1 opacity-70 max-w-md text-center">
            Os dados são atualizados automaticamente a cada 6h. O filtro de dias funciona sobre o cache — você pode alterar livremente sem refazer a busca.
          </p>
        </div>
      )}

      <LogTerminal logs={state.logs} carregando={state.carregando} logEndRef={state.logEndRef} />

      {state.progresso && (
        <div className="mb-4 rounded-xl border border-blue-500/20 bg-black/20 backdrop-blur p-4">
          <div className="flex justify-between text-xs text-gray-400 mb-2 font-mono">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-zen" />Verificando RDV</span>
            <span className="tabular-nums">{state.progresso.verificados} / {state.progresso.total} · <span className="text-blue-300 font-semibold">{state.progresso.encontrados}</span> encontrado(s)</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-400 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(59,130,246,0.6)]"
                 style={{ width: `${Math.min((state.progresso.verificados / state.progresso.total) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {state.relatorio && (
        <>
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-gray-400 font-mono">
              <span className="text-white font-bold tabular-nums text-sm">{veiculosFiltrados.length.toLocaleString('pt-BR')}</span>
              <span className="text-gray-600 mx-1">/</span>
              <span className="tabular-nums">{state.relatorio.veiculos.length.toLocaleString('pt-BR')}</span>
              <span className="ml-2 text-gray-500">veículo(s) no filtro atual</span>
              {selecionados.size > 0 && (
                <span className="ml-3 text-blue-300">
                  · <span className="font-bold">{selecionados.size}</span> selecionado(s)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selecionados.size > 0 && (
                <button onClick={() => setSelecionados(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-300 underline">
                  Limpar seleção
                </button>
              )}
              <button onClick={() => setModalAberto(true)} disabled={veiculosSelecionados.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-emerald-500/40 hover:shadow-emerald-500/60 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none transition-all">
                <Send size={14} />
                Enviar mensagens{veiculosSelecionados.length > 0 ? ` (${veiculosSelecionados.length})` : ''}
              </button>
            </div>
          </div>
          <TabelaSemPontuar veiculos={veiculosFiltrados} selecionados={selecionados} setSelecionados={setSelecionados} />
        </>
      )}

      <ModalEnviarMensagens
        veiculos={veiculosSelecionados}
        aberto={modalAberto}
        onClose={() => setModalAberto(false)}
      />
    </div>
  );
}

// ============================================================================
// STAT CARD
// ============================================================================
const ABAS_CONFIG = {
  inativos: { label: 'Inativos + RDV ativo', icon: AlertTriangle, tone: 'red' as const, gradient: 'from-red-500 to-rose-500', ring: 'ring-red-500/40' },
  ausentes: { label: 'Sem rastreador (FIPE)', icon: CarFront, tone: 'orange' as const, gradient: 'from-orange-500 to-amber-500', ring: 'ring-orange-500/40' },
  sem_pontuar: { label: 'Sem pontuar', icon: WifiOff, tone: 'zen' as const, gradient: 'from-blue-600 to-blue-400', ring: 'ring-blue-500/40' },
};

function StatCard({ tipo, ativo, relatorio, totalOverride, onClick }: {
  tipo: keyof typeof ABAS_CONFIG;
  ativo: boolean;
  relatorio: { total: number; gerado_em: string; dias_filtro?: number } | null;
  totalOverride?: number;
  onClick: () => void;
}) {
  const cfg = ABAS_CONFIG[tipo];
  const Icon = cfg.icon;
  const total = totalOverride ?? relatorio?.total;
  return (
    <button onClick={onClick}
      className={`glass relative group rounded-2xl p-5 flex items-start gap-4 text-left transition-all overflow-hidden ${
        ativo ? `ring-2 ${cfg.ring}` : 'hover:border-blue-500/30'
      }`}>
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${cfg.gradient} ${ativo ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'} transition-opacity shadow-[0_0_12px_currentColor]`} />
      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${cfg.gradient} shadow-lg flex-shrink-0`} style={{ boxShadow: `0 8px 24px -4px rgba(59, 130, 246, 0.4)` }}>
        <Icon size={18} className="text-white" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.12em]">{cfg.label}</p>
        <p className="text-3xl font-bold text-white mt-1 tabular-nums font-mono leading-none">
          {total !== undefined ? total.toLocaleString('pt-BR') : '—'}
        </p>
        <p className="text-[11px] text-gray-500 mt-2 truncate font-mono">
          {relatorio ? (
            <>
              <span className="text-blue-300/80">{formatarHaTempo(relatorio.gerado_em)}</span>
              <span className="text-gray-700 mx-1">·</span>
              <span>{new Date(relatorio.gerado_em).toLocaleDateString('pt-BR')}</span>
            </>
          ) : 'sem dados'}
        </p>
      </div>
    </button>
  );
}

// ============================================================================
// Painel inativos / ausentes
// ============================================================================
function PainelRelatorio({ state, tipo, ignorados, onIgnorar, onDesignorar }: {
  state: ReturnType<typeof useStreamRelatorio>; tipo: 'inativos' | 'ausentes';
  ignorados: Set<string>;
  onIgnorar: (placas: string[]) => void;
  onDesignorar: (placas: string[]) => void;
}) {
  const vazio = !state.relatorio && !state.carregando && state.logs.length === 0;
  const relI = tipo === 'inativos' ? state.relatorio as RelatorioInativos | null : null;
  const relA = tipo === 'ausentes' ? state.relatorio as RelatorioAusentes | null : null;
  const grad = tipo === 'inativos' ? 'from-red-500 to-rose-500' : 'from-orange-500 to-amber-500';
  const dot = tipo === 'inativos' ? 'bg-red-400' : 'bg-orange-400';

  return (
    <>
      {state.doCache && state.relatorio && !state.carregando && (
        <div className="mb-4 flex items-center gap-2 text-xs flex-wrap">
          <Database size={13} className="text-gray-500" />
          <span className="text-gray-500">Cache · gerado em {new Date(state.relatorio.gerado_em).toLocaleString('pt-BR')}</span>
          {(state.relatorio as { status?: string }).status === 'em_progresso' && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 pulse-zen" />
              parcial · {(state.relatorio as { verificados?: number }).verificados ?? 0}/{(state.relatorio as { total_alvo?: number }).total_alvo ?? '?'} processados
            </span>
          )}
          {(state.relatorio as { status?: string }).status === 'erro' && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono">
              parcial · interrompido em {(state.relatorio as { verificados?: number }).verificados ?? 0}/{(state.relatorio as { total_alvo?: number }).total_alvo ?? '?'}
            </span>
          )}
        </div>
      )}

      {state.erro && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300 backdrop-blur">
          <strong>Erro:</strong> {state.erro}
        </div>
      )}

      {vazio && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          {tipo === 'inativos' ? <AlertTriangle size={40} className="mb-3 opacity-30" /> : <CarFront size={40} className="mb-3 opacity-30" />}
          <p className="text-sm">Clique em &quot;Gerar relatório&quot; para consultar</p>
          <p className="text-xs mt-1 opacity-70 max-w-md text-center">
            {tipo === 'inativos'
              ? 'Serão verificadas placas inativas no SGA que ainda constam na Rede Veículos'
              : 'Serão verificados veículos ativos no SGA que deveriam estar na RDV conforme regras FIPE'}
          </p>
        </div>
      )}

      <LogTerminal logs={state.logs} carregando={state.carregando} logEndRef={state.logEndRef} />

      {state.progresso && (
        <div className="mb-4 rounded-xl border border-blue-500/20 bg-black/20 backdrop-blur p-4">
          <div className="flex justify-between text-xs text-gray-400 mb-2 font-mono">
            <span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${dot} pulse-zen`} />Verificando RDV</span>
            <span className="tabular-nums">{state.progresso.verificados} / {state.progresso.total} · <span className="text-blue-300 font-semibold">{state.progresso.encontrados}</span> encontrado(s)</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
            <div className={`bg-gradient-to-r ${grad} h-full rounded-full transition-all duration-300`}
                 style={{ width: `${Math.min((state.progresso.verificados / state.progresso.total) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {relI && <TabelaInativos veiculos={relI.veiculos} />}
      {relA && <TabelaAusentes veiculos={relA.veiculos} ignorados={ignorados} onIgnorar={onIgnorar} onDesignorar={onDesignorar} />}
    </>
  );
}

// ============================================================================
// DASHBOARD
// ============================================================================
export default function Dashboard() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('inativos');
  const [diasSemPontuar, setDiasSemPontuar] = useState(1);
  const [rdvLocal, setRdvLocal] = useState<{ total: number; importado_em: string } | null>(null);
  const [importando, setImportando] = useState(false);
  const [ignoradosAusentes, setIgnoradosAusentes] = useState<Set<string>>(new Set());
  const [rescanTrigger, setRescanTrigger] = useState(0);

  useEffect(() => {
    fetch('/api/rdv/local-stats').then(r => r.json()).then(d => { if (d.ok) setRdvLocal(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/relatorio/ausentes/ignorados')
      .then(r => r.json())
      .then((d: { ignorados?: { placa: string }[] }) => {
        setIgnoradosAusentes(new Set((d.ignorados ?? []).map(i => i.placa.toUpperCase())));
      }).catch(() => {});
  }, []);

  const handleIgnorarAusentes = async (placas: string[]) => {
    const res = await fetch('/api/relatorio/ausentes/ignorados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placas }),
    });
    const d = await res.json() as { ignorados?: { placa: string }[] };
    setIgnoradosAusentes(new Set((d.ignorados ?? []).map(i => i.placa.toUpperCase())));
  };

  const handleDesignorarAusentes = async (placas: string[]) => {
    const res = await fetch('/api/relatorio/ausentes/ignorados', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placas }),
    });
    const d = await res.json() as { ignorados?: { placa: string }[] };
    setIgnoradosAusentes(new Set((d.ignorados ?? []).map(i => i.placa.toUpperCase())));
  };

  async function importarRelatorioRDV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/rdv/importar', { method: 'POST', body: fd });
      const d = await res.json();
      if (d.ok) setRdvLocal({ total: d.total, importado_em: d.importado_em });
      else alert('Erro ao importar: ' + d.erro);
    } catch { alert('Erro ao importar arquivo'); }
    finally { setImportando(false); e.target.value = ''; }
  }

  const inativos = useStreamRelatorio('/api/relatorio/inativos/stream');
  const ausentes = useStreamRelatorio('/api/relatorio/ausentes/stream');
  const semPontuar = useStreamSemPontuar();

  useEffect(() => {
    let cancelado = false;

    function aplicar(d: { inativos?: unknown; ausentes?: unknown; sem_pontuar?: unknown }) {
      if (cancelado) return;
      if (d.inativos) { inativos.setRelatorio(d.inativos as never); inativos.setDoCache(true); }
      if (d.ausentes) { ausentes.setRelatorio(d.ausentes as never); ausentes.setDoCache(true); }
      if (d.sem_pontuar) {
        semPontuar.setRelatorio(d.sem_pontuar as never); semPontuar.setDoCache(true);
        const sp = d.sem_pontuar as { dias_filtro?: number };
        if (sp.dias_filtro) setDiasSemPontuar(sp.dias_filtro);
      }
    }

    function temAlgumEmProgresso(d: { inativos?: { status?: string }; ausentes?: { status?: string }; sem_pontuar?: { status?: string } }): boolean {
      return d.inativos?.status === 'em_progresso'
        || d.ausentes?.status === 'em_progresso'
        || d.sem_pontuar?.status === 'em_progresso';
    }

    async function carregar() {
      try {
        const res = await fetch('/api/relatorio/cache');
        const d = await res.json();
        aplicar(d);
        // Se algum relatório está sendo gerado, refaz o fetch a cada 20s
        if (temAlgumEmProgresso(d) && !cancelado) {
          setTimeout(carregar, 20_000);
        }
      } catch { /* tenta de novo no próximo ciclo, se aplicável */ }
    }

    carregar();
    return () => { cancelado = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregandoAtivo = abaAtiva === 'sem_pontuar' ? semPontuar.carregando
    : abaAtiva === 'inativos' ? inativos.carregando : ausentes.carregando;
  const relAtivo = abaAtiva === 'sem_pontuar' ? semPontuar.relatorio
    : abaAtiva === 'inativos' ? inativos.relatorio : ausentes.relatorio;
  const doCacheAtivo = abaAtiva === 'sem_pontuar' ? semPontuar.doCache
    : abaAtiva === 'inativos' ? inativos.doCache : ausentes.doCache;

  function executarAtivo() {
    if (abaAtiva === 'inativos') inativos.executar();
    else if (abaAtiva === 'ausentes') ausentes.executar();
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-[10px] font-mono uppercase tracking-[0.15em] text-blue-300">
              <Activity size={10} className="text-blue-400" />
              Live · Dashboard
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            <span className="text-gradient-zen">Central de Rastreamento</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-mono">
            SGA (Hinova) <span className="text-gray-700 mx-1">→</span> Rede Veículos
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Importar relatório RDV */}
          <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${importando ? 'opacity-50 cursor-not-allowed border-gray-600 bg-gray-700/20' : 'border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20'}`}>
            <Upload size={13} className="text-blue-400" />
            <span className="text-[11px] font-mono text-blue-300">
              {importando ? 'importando...' : rdvLocal ? `RDV local · ${rdvLocal.total.toLocaleString('pt-BR')} veíc.` : 'Importar RDV'}
            </span>
            <input type="file" accept=".xlsx,.xls" className="hidden" disabled={importando} onChange={importarRelatorioRDV} />
          </label>
          {/* Status de auto-refresh */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-400" />
            </span>
            <span className="text-[11px] font-mono text-emerald-300">auto-refresh · 6h</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard tipo="inativos" ativo={abaAtiva === 'inativos'} relatorio={inativos.relatorio} onClick={() => setAbaAtiva('inativos')} />
        <StatCard tipo="ausentes" ativo={abaAtiva === 'ausentes'} relatorio={ausentes.relatorio}
          totalOverride={ausentes.relatorio ? ausentes.relatorio.veiculos.filter(v => !ignoradosAusentes.has((v.placa || '').toUpperCase())).length : undefined}
          onClick={() => setAbaAtiva('ausentes')} />
        <StatCard tipo="sem_pontuar" ativo={abaAtiva === 'sem_pontuar'} relatorio={semPontuar.relatorio}
          totalOverride={semPontuar.relatorio ? semPontuar.relatorio.veiculos.filter(v => (v.dias_sem_pontuar ?? 0) >= diasSemPontuar).length : undefined}
          onClick={() => setAbaAtiva('sem_pontuar')} />
      </div>

      {/* Painel principal */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="border-b border-blue-500/10 px-6 pt-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-0">
            {(Object.keys(ABAS_CONFIG) as Aba[]).map(key => {
              const cfg = ABAS_CONFIG[key]; const Icon = cfg.icon; const ativo = abaAtiva === key;
              const rel = key === 'inativos' ? inativos.relatorio : key === 'ausentes' ? ausentes.relatorio : semPontuar.relatorio;
              const badgeCount = key === 'sem_pontuar' && semPontuar.relatorio
                ? semPontuar.relatorio.veiculos.filter(v => (v.dias_sem_pontuar ?? 0) >= diasSemPontuar).length
                : key === 'ausentes' && ausentes.relatorio
                ? ausentes.relatorio.veiculos.filter(v => !ignoradosAusentes.has((v.placa || '').toUpperCase())).length
                : rel?.total;
              return (
                <button key={key} onClick={() => setAbaAtiva(key)}
                  className={`relative px-4 py-3 text-sm font-medium transition-all ${ativo ? 'text-white' : 'text-gray-500 hover:text-gray-200'}`}>
                  <span className="flex items-center gap-2">
                    <Icon size={14} className={ativo ? 'text-blue-400' : ''} />
                    {cfg.label}
                    {badgeCount !== undefined && (
                      <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums ${
                        ativo ? `bg-gradient-to-r ${cfg.gradient} text-white` : 'bg-white/5 text-gray-400'
                      }`}>{badgeCount}</span>
                    )}
                  </span>
                  {ativo && (
                    <span className={`absolute inset-x-3 -bottom-px h-0.5 bg-gradient-to-r ${cfg.gradient} rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]`} />
                  )}
                </button>
              );
            })}
          </div>

          {abaAtiva !== 'sem_pontuar' && (
            <button onClick={executarAtivo} disabled={carregandoAtivo}
              className={`group flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${ABAS_CONFIG[abaAtiva].gradient} text-white text-sm font-semibold rounded-lg shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 transition-all`}
              style={{ boxShadow: '0 8px 24px -4px rgba(59, 130, 246, 0.4)' }}>
              {carregandoAtivo ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} className="group-hover:rotate-12 transition-transform" />}
              {carregandoAtivo ? 'Consultando...' : doCacheAtivo && relAtivo ? 'Atualizar' : 'Gerar relatório'}
            </button>
          )}
        </div>

        <div className="p-6">
          {abaAtiva === 'inativos' && <PainelRelatorio state={inativos} tipo="inativos" ignorados={new Set()} onIgnorar={() => {}} onDesignorar={() => {}} />}
          {abaAtiva === 'ausentes' && <PainelRelatorio state={ausentes} tipo="ausentes" ignorados={ignoradosAusentes} onIgnorar={handleIgnorarAusentes} onDesignorar={handleDesignorarAusentes} />}
          {abaAtiva === 'sem_pontuar' && <PainelSemPontuar state={semPontuar} dias={diasSemPontuar} setDias={setDiasSemPontuar} />}
        </div>
      </div>
    </div>
  );
}
