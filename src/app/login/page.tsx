'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ZenLogo from '../components/ZenLogo';

export default function LoginPage() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.erro || 'Erro ao fazer login'); return; }
      router.push('/');
      router.refresh();
    } catch {
      setErro('Erro de conexão. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-blue-500/30 blur-xl rounded-full" />
            <div className="relative"><ZenLogo className="w-14 h-14" /></div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-white tracking-tight">Central de Rastreamento</div>
            <div className="text-xs font-mono text-blue-400/80 uppercase tracking-[0.15em] mt-1">ZEN · SEGUROS</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-blue-500/10 bg-white/[0.03] backdrop-blur p-6">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Usuário</label>
            <input
              type="text"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              autoComplete="username"
              required
              className="w-full bg-white/[0.05] border border-blue-500/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full bg-white/[0.05] border border-blue-500/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-colors"
            />
          </div>
          {erro && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>
          )}
          <button
            type="submit"
            disabled={carregando}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
