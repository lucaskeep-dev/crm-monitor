'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, KeyRound, Check, X, Loader2 } from 'lucide-react';

interface UsuarioItem {
  id: string;
  usuario: string;
  criadoEm: string;
  ultimoAcesso?: string;
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [novoUsuario, setNovoUsuario] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState('');

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [novaSenhaEdit, setNovaSenhaEdit] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const res = await fetch('/api/usuarios');
    setUsuarios(await res.json());
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    setErroCriar('');
    setCriando(true);
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: novoUsuario, senha: novaSenha }),
      });
      const data = await res.json();
      if (!res.ok) { setErroCriar(data.erro); return; }
      setNovoUsuario(''); setNovaSenha('');
      await carregar();
    } finally { setCriando(false); }
  }

  async function remover(id: string) {
    setRemovendoId(id);
    await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
    setRemovendoId(null);
    await carregar();
  }

  async function salvarSenha(id: string) {
    if (!novaSenhaEdit.trim()) return;
    setSalvandoSenha(true);
    await fetch(`/api/usuarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: novaSenhaEdit }),
    });
    setSalvandoSenha(false);
    setEditandoId(null);
    setNovaSenhaEdit('');
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Usuários</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie quem tem acesso ao sistema</p>
      </div>

      {/* Formulário novo usuário */}
      <form onSubmit={criarUsuario} className="rounded-2xl border border-blue-500/10 bg-white/[0.02] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><UserPlus size={15} />Novo usuário</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={novoUsuario}
            onChange={e => setNovoUsuario(e.target.value)}
            placeholder="Nome de usuário"
            required
            className="flex-1 bg-white/[0.05] border border-blue-500/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
          />
          <input
            type="password"
            value={novaSenha}
            onChange={e => setNovaSenha(e.target.value)}
            placeholder="Senha"
            required
            className="flex-1 bg-white/[0.05] border border-blue-500/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
          />
          <button
            type="submit"
            disabled={criando}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {criando ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Criar
          </button>
        </div>
        {erroCriar && <p className="text-sm text-red-400">{erroCriar}</p>}
      </form>

      {/* Lista de usuários */}
      <div className="rounded-2xl border border-blue-500/10 bg-white/[0.02] divide-y divide-blue-500/10">
        {carregando ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Carregando...
          </div>
        ) : usuarios.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">Nenhum usuário cadastrado</div>
        ) : usuarios.map(u => (
          <div key={u.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium text-white">{u.usuario}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                Criado em {formatarData(u.criadoEm)}
                {u.ultimoAcesso && (
                  <span className="ml-3 text-blue-400/70">· Último acesso: {formatarData(u.ultimoAcesso)}</span>
                )}
              </div>
            </div>

            {editandoId === u.id ? (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={novaSenhaEdit}
                  onChange={e => setNovaSenhaEdit(e.target.value)}
                  placeholder="Nova senha"
                  autoFocus
                  className="bg-white/[0.05] border border-blue-500/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500/50 w-40"
                />
                <button
                  onClick={() => salvarSenha(u.id)}
                  disabled={salvandoSenha}
                  className="p-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white transition-colors disabled:opacity-60"
                  title="Salvar"
                >
                  {salvandoSenha ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                </button>
                <button
                  onClick={() => { setEditandoId(null); setNovaSenhaEdit(''); }}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 transition-colors"
                  title="Cancelar"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditandoId(u.id); setNovaSenhaEdit(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                  title="Alterar senha"
                >
                  <KeyRound size={13} /> Alterar senha
                </button>
                <button
                  onClick={() => remover(u.id)}
                  disabled={removendoId === u.id || usuarios.length <= 1}
                  className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={usuarios.length <= 1 ? 'Não é possível remover o único usuário' : 'Remover'}
                >
                  {removendoId === u.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
