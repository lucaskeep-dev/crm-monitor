'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, RefreshCw, Search, DollarSign } from 'lucide-react';
import { RegraFipe, SGATipoVeiculo } from '@/types';

function formatarMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface FormState {
  tiposSelecionados: Set<number>;
  valor_fipe_minimo: string;
  valor_fipe_maximo: string;
  ativo: boolean;
}

const FORM_INICIAL: FormState = {
  tiposSelecionados: new Set(),
  valor_fipe_minimo: '',
  valor_fipe_maximo: '',
  ativo: true,
};

export default function RegrasFipePage() {
  const [regras, setRegras] = useState<RegraFipe[]>([]);
  const [tipos, setTipos] = useState<SGATipoVeiculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [carregandoTipos, setCarregandoTipos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [buscaTipo, setBuscaTipo] = useState('');

  const carregarRegras = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/regras-fipe');
      const data = await res.json();
      setRegras(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setCarregando(false); }
  }, []);

  const carregarTipos = useCallback(async () => {
    setCarregandoTipos(true);
    try {
      const res = await fetch('/api/tipos-veiculo');
      const data = await res.json();
      setTipos(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setCarregandoTipos(false); }
  }, []);

  useEffect(() => { carregarRegras(); }, [carregarRegras]);

  function fb(tipo: 'sucesso' | 'erro', msg: string) {
    setFeedback({ tipo, msg });
    setTimeout(() => setFeedback(null), 4000);
  }

  function toggleTipo(c: number) {
    setForm(f => {
      const n = new Set(f.tiposSelecionados);
      n.has(c) ? n.delete(c) : n.add(c);
      return { ...f, tiposSelecionados: n };
    });
  }

  const tiposFiltrados = tipos.filter(t =>
    buscaTipo === '' || t.descricao_tipo.toLowerCase().includes(buscaTipo.toLowerCase())
  );

  function selecionarTodos() {
    setForm(f => ({ ...f, tiposSelecionados: new Set([...f.tiposSelecionados, ...tiposFiltrados.map(t => t.codigo_tipo)]) }));
  }
  function desmarcarTodos() {
    const filt = new Set(tiposFiltrados.map(t => t.codigo_tipo));
    setForm(f => ({ ...f, tiposSelecionados: new Set([...f.tiposSelecionados].filter(c => !filt.has(c))) }));
  }

  async function salvarRegra(e: React.FormEvent) {
    e.preventDefault();
    if (form.tiposSelecionados.size === 0) { fb('erro', 'Selecione pelo menos um tipo de veículo.'); return; }
    if (!form.valor_fipe_minimo) { fb('erro', 'Valor FIPE mínimo é obrigatório.'); return; }
    setSalvando(true);
    try {
      const tiposPayload = [...form.tiposSelecionados].map(codigo => {
        const t = tipos.find(x => x.codigo_tipo === codigo);
        return { codigo, nome: t?.descricao_tipo ?? String(codigo) };
      });
      const res = await fetch('/api/regras-fipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipos: tiposPayload, classificacoes: [],
          valor_fipe_minimo: Number(form.valor_fipe_minimo),
          valor_fipe_maximo: form.valor_fipe_maximo ? Number(form.valor_fipe_maximo) : null,
          ativo: form.ativo,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro'); }
      setForm(FORM_INICIAL); setBuscaTipo(''); setMostrarForm(false);
      await carregarRegras();
      fb('sucesso', 'Regra cadastrada com sucesso!');
    } catch (e) { fb('erro', String(e)); }
    finally { setSalvando(false); }
  }

  async function toggleAtivo(r: RegraFipe) {
    try {
      const res = await fetch('/api/regras-fipe', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, ativo: !r.ativo }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar');
      await carregarRegras();
    } catch (e) { fb('erro', String(e)); }
  }

  async function excluirRegra(id: string) {
    if (!confirm('Deseja excluir esta regra?')) return;
    try {
      const res = await fetch(`/api/regras-fipe?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      await carregarRegras();
      fb('sucesso', 'Regra excluída.');
    } catch (e) { fb('erro', String(e)); }
  }

  function abrirForm() {
    setMostrarForm(true);
    if (tipos.length === 0) carregarTipos();
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-[10px] font-mono uppercase tracking-[0.15em] text-blue-300">
              <DollarSign size={10} className="text-blue-400" />
              Config · Regras
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-gradient-zen">Regras FIPE</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Defina por tipo de veículo e faixa de valor FIPE quais veículos devem ter rastreador na Rede Veículos.
          </p>
        </div>
        {!mostrarForm && (
          <button onClick={abrirForm}
            className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 hover:scale-[1.02] active:scale-[0.98] transition-all">
            <Plus size={16} className="group-hover:rotate-90 transition-transform" />
            Nova regra
          </button>
        )}
      </div>

      {feedback && (
        <div className={`mb-4 flex items-center gap-3 p-4 rounded-xl border text-sm backdrop-blur ${
          feedback.tipo === 'sucesso'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          {feedback.tipo === 'sucesso' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {feedback.msg}
        </div>
      )}

      {mostrarForm && (
        <div className="mb-6 glass rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            Nova Regra FIPE
          </h2>
          <form onSubmit={salvarRegra} className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.15em]">
                  Tipos de Veículo *
                  {form.tiposSelecionados.size > 0 && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">
                      {form.tiposSelecionados.size}
                    </span>
                  )}
                </label>
                {tipos.length === 0 ? (
                  <button type="button" onClick={carregarTipos} disabled={carregandoTipos}
                    className="flex items-center gap-1 px-3 py-1.5 border border-blue-500/20 bg-white/5 rounded-lg text-xs text-gray-300 hover:bg-white/10 disabled:opacity-60">
                    <RefreshCw size={12} className={carregandoTipos ? 'animate-spin' : ''} />
                    {carregandoTipos ? 'Carregando...' : 'Buscar tipos do SGA'}
                  </button>
                ) : (
                  <div className="flex gap-2 items-center text-xs">
                    <button type="button" onClick={selecionarTodos} className="text-blue-400 hover:text-blue-300 font-medium">Selecionar todos</button>
                    <span className="text-gray-700">·</span>
                    <button type="button" onClick={desmarcarTodos} className="text-gray-500 hover:text-gray-300">Desmarcar todos</button>
                  </div>
                )}
              </div>
              {tipos.length > 0 && (
                <>
                  <div className="relative mb-2">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input type="text" placeholder="Filtrar tipos..." value={buscaTipo} onChange={e => setBuscaTipo(e.target.value)}
                      className="pl-8 pr-3 py-2 w-full border border-blue-500/20 bg-white/5 text-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                  </div>
                  <div className="border border-blue-500/15 rounded-lg max-h-56 overflow-y-auto divide-y divide-blue-500/10 bg-black/20">
                    {tiposFiltrados.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-6">Nenhum tipo encontrado</p>
                    ) : tiposFiltrados.map(t => {
                      const sel = form.tiposSelecionados.has(t.codigo_tipo);
                      return (
                        <label key={t.codigo_tipo} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${sel ? 'bg-blue-500/10' : 'hover:bg-white/5'}`}>
                          <input type="checkbox" checked={sel} onChange={() => toggleTipo(t.codigo_tipo)} className="w-4 h-4 rounded" />
                          <span className={`text-sm ${sel ? 'font-medium text-blue-200' : 'text-gray-300'}`}>{t.descricao_tipo}</span>
                          <span className="ml-auto text-[10px] font-mono text-gray-600">{t.codigo_tipo}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-[0.15em] mb-1.5">Valor FIPE Mínimo (R$) *</label>
                <input type="number" placeholder="50000" value={form.valor_fipe_minimo} required min="0"
                  onChange={e => setForm(f => ({ ...f, valor_fipe_minimo: e.target.value }))}
                  className="w-full border border-blue-500/20 bg-white/5 text-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-[0.15em] mb-1.5">
                  Valor FIPE Máximo (R$) <span className="text-gray-600 normal-case">· opcional</span>
                </label>
                <input type="number" placeholder="200000" value={form.valor_fipe_maximo} min="0"
                  onChange={e => setForm(f => ({ ...f, valor_fipe_maximo: e.target.value }))}
                  className="w-full border border-blue-500/20 bg-white/5 text-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-300">Regra ativa</span>
            </label>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={salvando || form.tiposSelecionados.size === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 transition-all">
                {salvando ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                {salvando ? 'Salvando...' : 'Salvar regra'}
              </button>
              <button type="button" onClick={() => { setMostrarForm(false); setForm(FORM_INICIAL); setBuscaTipo(''); }}
                className="px-5 py-2.5 border border-white/10 bg-white/5 text-gray-300 text-sm font-medium rounded-lg hover:bg-white/10 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-blue-500/10 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            Regras cadastradas
            {!carregando && <span className="ml-2 text-sm font-mono font-normal text-gray-500">({regras.length})</span>}
          </h2>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <RefreshCw size={20} className="animate-spin mr-2 text-blue-400" /> Carregando...
          </div>
        ) : regras.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <AlertCircle size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Nenhuma regra cadastrada</p>
            <p className="text-xs mt-1 opacity-70">Clique em &quot;Nova regra&quot; para começar</p>
          </div>
        ) : (
          <div className="divide-y divide-blue-500/10">
            {regras.map(r => (
              <div key={r.id} className={`px-6 py-4 flex items-start justify-between gap-4 transition-opacity ${!r.ativo ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  {!r.ativo && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 text-gray-500 mb-1">Inativa</span>
                  )}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {r.tipos.map(t => (
                      <span key={t.codigo} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/25">{t.nome}</span>
                    ))}
                  </div>
                  <div className="text-sm text-gray-300 tabular-nums">
                    <span className="text-gray-500">Valor FIPE:</span> {formatarMoeda(r.valor_fipe_minimo)}
                    {r.valor_fipe_maximo ? ` até ${formatarMoeda(r.valor_fipe_maximo)}` : ' ou mais'}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-600 font-mono">
                    Criada em {new Date(r.criado_em).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleAtivo(r)} className="text-gray-500 hover:text-blue-300 transition-colors" title={r.ativo ? 'Desativar' : 'Ativar'}>
                    {r.ativo ? <ToggleRight size={24} className="text-blue-400" /> : <ToggleLeft size={24} />}
                  </button>
                  <button onClick={() => excluirRegra(r.id)} className="text-gray-500 hover:text-red-400 transition-colors" title="Excluir">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm text-blue-200 backdrop-blur">
        <strong className="text-blue-300">Como funciona:</strong> Para cada veículo ativo no SGA que se enquadra em uma regra (tipo + faixa de valor FIPE), o sistema verifica se ele está cadastrado na Rede Veículos. Os que não estiverem aparecem no relatório &quot;Sem rastreador&quot; no Dashboard.
      </div>
    </div>
  );
}
