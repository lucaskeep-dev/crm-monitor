'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Save, AlertCircle, CheckCircle2, Info, Search, SlidersHorizontal,
  MessageCircle, Mail, FileText, Eye, EyeOff,
} from 'lucide-react';
import { SituacaoComConfig, ConfigMensagens } from '@/types';

type Tab = 'situacoes' | 'whatsapp' | 'email' | 'templates';

export default function ConfiguracoesPage() {
  const [tab, setTab] = useState<Tab>('situacoes');

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-[10px] font-mono uppercase tracking-[0.15em] text-blue-300">
            <SlidersHorizontal size={10} className="text-blue-400" />
            Config
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-gradient-zen">Configurações</span>
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Situações inativas e configuração de envio de mensagens (WhatsApp + E-mail).
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-blue-500/10 flex gap-0 overflow-x-auto">
        {([
          { key: 'situacoes', label: 'Situações inativas', icon: SlidersHorizontal },
          { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
          { key: 'email', label: 'E-mail', icon: Mail },
          { key: 'templates', label: 'Mensagens', icon: FileText },
        ] as { key: Tab; label: string; icon: typeof SlidersHorizontal }[]).map(({ key, label, icon: Icon }) => {
          const ativo = tab === key;
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`relative px-4 py-3 text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                ativo ? 'text-white' : 'text-gray-500 hover:text-gray-200'
              }`}>
              <Icon size={14} className={ativo ? 'text-blue-400' : ''} />
              {label}
              {ativo && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
              )}
            </button>
          );
        })}
      </div>

      {tab === 'situacoes' && <SecaoSituacoes />}
      {(tab === 'whatsapp' || tab === 'email' || tab === 'templates') && <SecaoMensagens tab={tab} />}
    </div>
  );
}

// ============================================================================
// SITUAÇÕES INATIVAS
// ============================================================================
function SecaoSituacoes() {
  const [situacoes, setSituacoes] = useState<SituacaoComConfig[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [atualizado, setAtualizado] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const situacoesFiltradas = situacoes.filter(s => {
    const t = busca.toLowerCase().trim();
    if (!t) return true;
    return (s.descricao_situacao || s.situacao || '').toLowerCase().includes(t) || String(s.codigo_situacao).includes(t);
  });

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const res = await fetch('/api/situacoes');
      const data = await res.json();
      if (data.erro) throw new Error(data.erro);
      setSituacoes(data.situacoes ?? []);
      setAtualizado(data.atualizado_em ?? null);
      setSel(new Set((data.situacoes as SituacaoComConfig[]).filter(s => s.marcada_inativa).map(s => Number(s.codigo_situacao))));
    } catch (e) { setErro(String(e)); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function toggle(c: number | string) {
    const cod = Number(c);
    setSel(p => { const n = new Set(p); n.has(cod) ? n.delete(cod) : n.add(cod); return n; });
  }

  function fb(tipo: 'sucesso' | 'erro', msg: string) {
    setFeedback({ tipo, msg }); setTimeout(() => setFeedback(null), 4000);
  }

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch('/api/situacoes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigos_inativos: Array.from(sel) }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.erro || 'Erro ao salvar'); }
      const data = await res.json();
      setAtualizado(data.atualizado_em);
      fb('sucesso', `Configuração salva — ${sel.size} situação(ões) marcada(s) como inativa(s).`);
    } catch (e) { fb('erro', String(e)); }
    finally { setSalvando(false); }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-2">
        <button onClick={carregar} disabled={carregando}
          className="flex items-center gap-2 px-3 py-2 border border-white/10 bg-white/5 text-gray-300 text-sm font-medium rounded-lg hover:bg-white/10 disabled:opacity-60 transition-colors">
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
          Recarregar
        </button>
        <button onClick={salvar} disabled={salvando || carregando}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 transition-all">
          {salvando ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
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

      <div className="mb-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-3 text-sm text-blue-200 backdrop-blur">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-400" />
        <span>
          Marque as situações que indicam que um veículo está <strong className="text-blue-300">inativo no SGA</strong>.
          O relatório &quot;Inativos no SGA + RDV ativo&quot; usará essas situações para buscar veículos que ainda constam na Rede Veículos.
        </span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-blue-500/10 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            Situações de veículo (SGA)
            {!carregando && situacoes.length > 0 && (
              <span className="ml-2 text-sm font-mono font-normal text-gray-500">({situacoes.length})</span>
            )}
          </h2>
          {sel.size > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-300 border border-red-500/25">
              {sel.size} marcada{sel.size !== 1 ? 's' : ''} como inativa{sel.size !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <RefreshCw size={20} className="animate-spin mr-3 text-blue-400" />
            <span className="text-sm">Buscando situações no SGA...</span>
          </div>
        ) : erro ? (
          <div className="m-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300 flex items-start gap-3">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <div><strong>Erro ao carregar situações:</strong> {erro}</div>
          </div>
        ) : situacoes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <AlertCircle size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Nenhuma situação encontrada no SGA</p>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b border-blue-500/10 bg-black/10">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input type="text" placeholder="Filtrar situações por nome ou código..." value={busca} onChange={e => setBusca(e.target.value)}
                  className="pl-9 pr-3 py-2 w-full sm:w-96 border border-blue-500/20 bg-white/5 text-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            </div>
            {situacoesFiltradas.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">Nenhuma situação corresponde ao filtro</div>
            ) : (
              <div className="divide-y divide-blue-500/10">
                {situacoesFiltradas.map(s => {
                  const a = sel.has(Number(s.codigo_situacao));
                  return (
                    <label key={s.codigo_situacao}
                      className={`flex items-center gap-4 px-6 py-4 cursor-pointer transition-colors ${
                        a ? 'bg-red-500/10 hover:bg-red-500/15' : 'hover:bg-white/5'
                      }`}>
                      <input type="checkbox" checked={a} onChange={() => toggle(s.codigo_situacao)} className="w-4 h-4 rounded" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium ${a ? 'text-red-300' : 'text-gray-200'}`}>
                            {s.descricao_situacao || s.situacao}
                          </span>
                          {a && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/30">
                              Inativa
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 font-mono">
                          Código: {s.codigo_situacao} · Situação: {s.situacao}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!carregando && !erro && atualizado && (
          <div className="px-6 py-3 border-t border-blue-500/10 text-[11px] text-gray-500 font-mono">
            Configuração salva em {new Date(atualizado).toLocaleString('pt-BR')}
          </div>
        )}
      </div>
    </>
  );
}

// ============================================================================
// MENSAGERIA (WhatsApp + E-mail + Templates)
// ============================================================================
const PLACEHOLDERS_DISPONIVEIS = ['nome', 'placa', 'chassi', 'modelo', 'marca', 'dias_sem_pontuar', 'ultima_pontuacao', 'from_name'];

function SecaoMensagens({ tab }: { tab: 'whatsapp' | 'email' | 'templates' }) {
  const [config, setConfig] = useState<ConfigMensagens | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/config-mensagens');
      const data = await res.json();
      setConfig(data);
    } catch (e) { fb('erro', String(e)); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function fb(tipo: 'sucesso' | 'erro', msg: string) {
    setFeedback({ tipo, msg }); setTimeout(() => setFeedback(null), 4000);
  }

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    try {
      const { ...payload } = config;
      const res = await fetch('/api/config-mensagens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.erro || 'Erro ao salvar'); }
      const data = await res.json();
      setConfig(data);
      fb('sucesso', 'Configuração salva.');
    } catch (e) { fb('erro', String(e)); }
    finally { setSalvando(false); }
  }

  if (carregando || !config) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <RefreshCw size={20} className="animate-spin mr-3 text-blue-400" />
        <span className="text-sm">Carregando configurações...</span>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-2">
        <button onClick={salvar} disabled={salvando}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 transition-all">
          {salvando ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
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

      {tab === 'whatsapp' && <CardWhatsApp config={config} setConfig={setConfig} />}
      {tab === 'email' && <CardEmail config={config} setConfig={setConfig} />}
      {tab === 'templates' && <CardTemplates config={config} setConfig={setConfig} />}

      <div className="mt-3 text-[11px] text-gray-600 font-mono">
        Última alteração: {new Date(config.atualizado_em).toLocaleString('pt-BR')}
      </div>
    </>
  );
}

function PlaceholderHelp() {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {PLACEHOLDERS_DISPONIVEIS.map(p => (
        <code key={p} className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] font-mono">{`{${p}}`}</code>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-[0.15em] mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full border border-blue-500/20 bg-white/5 text-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50';

// --- WhatsApp ---
function CardWhatsApp({ config, setConfig }: { config: ConfigMensagens; setConfig: (c: ConfigMensagens) => void }) {
  const w = config.whatsapp;
  function set<K extends keyof typeof w>(k: K, v: typeof w[K]) {
    setConfig({ ...config, whatsapp: { ...w, [k]: v } });
  }
  const [mostrarToken, setMostrarToken] = useState(false);

  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <MessageCircle size={18} className="text-emerald-400" />
          WhatsApp Business — Meta Cloud API
        </h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={w.habilitado} onChange={e => set('habilitado', e.target.checked)} className="w-4 h-4 rounded" />
          <span className={`text-xs font-medium ${w.habilitado ? 'text-emerald-300' : 'text-gray-500'}`}>{w.habilitado ? 'Habilitado' : 'Desabilitado'}</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Phone Number ID" hint="ID do número (não é o número de telefone). Pegue no painel da Meta Business.">
          <input className={inputCls} value={w.phone_number_id} onChange={e => set('phone_number_id', e.target.value)} placeholder="123456789012345" />
        </Field>

        <Field label="Access Token" hint="Token permanente do System User. Tratado como senha — fica salvo em data/config-mensagens.json.">
          <div className="relative">
            <input className={inputCls + ' pr-10 font-mono'} type={mostrarToken ? 'text' : 'password'}
              value={w.access_token} onChange={e => set('access_token', e.target.value)} placeholder="EAA..." />
            <button type="button" onClick={() => setMostrarToken(m => !m)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {mostrarToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <Field label="Nome do template" hint="Nome exato do template aprovado no Meta Business (ex: aviso_sem_pontuar).">
          <input className={inputCls} value={w.template_name} onChange={e => set('template_name', e.target.value)} placeholder="aviso_sem_pontuar" />
        </Field>

        <Field label="Idioma do template" hint="Geralmente pt_BR.">
          <input className={inputCls} value={w.template_language} onChange={e => set('template_language', e.target.value)} placeholder="pt_BR" />
        </Field>

        <Field label="Variáveis do template (em ordem)" hint="As variáveis {{1}}, {{2}}... do template Meta serão preenchidas com estes campos, na ordem.">
          <input className={inputCls + ' font-mono'} value={w.variaveis.join(',')}
            onChange={e => set('variaveis', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="nome,placa,modelo,dias_sem_pontuar" />
          <PlaceholderHelp />
        </Field>
      </div>

      <div className="mt-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs text-amber-200/90 flex items-start gap-2">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
        <span>
          Para mensagens iniciadas pela empresa, o Meta exige template <strong>pré-aprovado</strong>. Cadastre o template no painel da Meta Business antes de habilitar aqui.
        </span>
      </div>
    </div>
  );
}

// --- E-mail ---
function CardEmail({ config, setConfig }: { config: ConfigMensagens; setConfig: (c: ConfigMensagens) => void }) {
  const e = config.email;
  function set<K extends keyof typeof e>(k: K, v: typeof e[K]) {
    setConfig({ ...config, email: { ...e, [k]: v } });
  }
  const [mostrarSenha, setMostrarSenha] = useState(false);

  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Mail size={18} className="text-blue-400" />
          E-mail — SMTP
        </h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={e.habilitado} onChange={ev => set('habilitado', ev.target.checked)} className="w-4 h-4 rounded" />
          <span className={`text-xs font-medium ${e.habilitado ? 'text-emerald-300' : 'text-gray-500'}`}>{e.habilitado ? 'Habilitado' : 'Desabilitado'}</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Host SMTP" hint="Para Hostinger geralmente é smtp.hostinger.com.">
          <input className={inputCls} value={e.smtp_host} onChange={ev => set('smtp_host', ev.target.value)} placeholder="smtp.hostinger.com" />
        </Field>

        <Field label="Porta">
          <input type="number" className={inputCls} value={e.smtp_port} onChange={ev => set('smtp_port', Number(ev.target.value))} />
        </Field>

        <Field label="Conexão segura">
          <select value={e.smtp_secure ? '1' : '0'} onChange={ev => set('smtp_secure', ev.target.value === '1')} className={inputCls}>
            <option value="1">SSL/TLS (porta 465)</option>
            <option value="0">STARTTLS (porta 587)</option>
          </select>
        </Field>

        <Field label="Usuário" hint="Geralmente o e-mail completo.">
          <input className={inputCls} value={e.smtp_user} onChange={ev => set('smtp_user', ev.target.value)} placeholder="contato@seudominio.com.br" />
        </Field>

        <Field label="Senha SMTP" hint="Senha do e-mail. Salva em data/config-mensagens.json.">
          <div className="relative">
            <input className={inputCls + ' pr-10 font-mono'} type={mostrarSenha ? 'text' : 'password'}
              value={e.smtp_pass} onChange={ev => set('smtp_pass', ev.target.value)} />
            <button type="button" onClick={() => setMostrarSenha(m => !m)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <Field label="Nome do remetente">
          <input className={inputCls} value={e.from_name} onChange={ev => set('from_name', ev.target.value)} placeholder="Zen Seguros" />
        </Field>

        <Field label="E-mail do remetente">
          <input className={inputCls} value={e.from_email} onChange={ev => set('from_email', ev.target.value)} placeholder="contato@seudominio.com.br" />
        </Field>

        <Field label="Reply-To (opcional)">
          <input className={inputCls} value={e.reply_to} onChange={ev => set('reply_to', ev.target.value)} placeholder="atendimento@seudominio.com.br" />
        </Field>
      </div>
    </div>
  );
}

// --- Templates / Mensagens ---
function CardTemplates({ config, setConfig }: { config: ConfigMensagens; setConfig: (c: ConfigMensagens) => void }) {
  const e = config.email;
  function setEmail<K extends keyof typeof e>(k: K, v: typeof e[K]) {
    setConfig({ ...config, email: { ...e, [k]: v } });
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-6 space-y-5">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <Mail size={18} className="text-blue-400" />
          Mensagem de e-mail
        </h2>

        <Field label="Assunto">
          <input className={inputCls} value={e.assunto} onChange={ev => setEmail('assunto', ev.target.value)} />
          <PlaceholderHelp />
        </Field>

        <Field label="Corpo (HTML)">
          <textarea className={inputCls + ' font-mono text-xs min-h-[200px]'} value={e.corpo_html} onChange={ev => setEmail('corpo_html', ev.target.value)} />
        </Field>

        <div className="rounded-lg border border-blue-500/15 bg-black/20 p-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-semibold mb-2">Pré-visualização</div>
          <div className="text-sm text-gray-300 mb-2"><strong>Assunto:</strong> {e.assunto}</div>
          <div className="text-sm text-gray-300 max-w-none rounded bg-black/30 p-3 border border-white/5"
            dangerouslySetInnerHTML={{ __html: e.corpo_html }} />
        </div>
      </div>

      <div className="glass rounded-2xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <MessageCircle size={18} className="text-emerald-400" />
          Mensagem de WhatsApp
        </h2>
        <p className="text-sm text-gray-400">
          O conteúdo da mensagem do WhatsApp é definido no <strong className="text-white">painel da Meta Business</strong> (template aprovado).
          Aqui você só configura quais campos vão preencher as variáveis (em <strong>WhatsApp</strong>).
        </p>
        <p className="text-xs text-gray-500">
          Variáveis configuradas: <code className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono">{config.whatsapp.variaveis.join(', ') || '(nenhuma)'}</code>
        </p>
      </div>
    </div>
  );
}
