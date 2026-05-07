'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, User, Loader2 } from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  usuario: string;
  acao: string;
  detalhes?: string;
}

const ACOES_LABEL: Record<string, string> = {
  login: 'Login',
  login_falhou: 'Login falhou',
  logout: 'Logout',
  importar_rdv: 'Importar RDV',
  relatorio_inativos: 'Relatório inativos',
  relatorio_inativos_erro: 'Erro inativos',
  exportar_csv_inativos: 'Exportar CSV',
  criar_usuario: 'Criar usuário',
  remover_usuario: 'Remover usuário',
  alterar_senha: 'Alterar senha',
};

const ACOES_COR: Record<string, string> = {
  login: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  login_falhou: 'text-red-400 bg-red-500/10 border-red-500/20',
  logout: 'text-gray-400 bg-white/5 border-white/10',
  importar_rdv: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  relatorio_inativos: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  relatorio_inativos_erro: 'text-red-400 bg-red-500/10 border-red-500/20',
  exportar_csv_inativos: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  criar_usuario: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  remover_usuario: 'text-red-400 bg-red-500/10 border-red-500/20',
  alterar_senha: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
};

function formatarHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroAcao, setFiltroAcao] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    const res = await fetch('/api/logs');
    setLogs(await res.json());
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const usuarios = Array.from(new Set(logs.map(l => l.usuario))).sort();
  const acoes = Array.from(new Set(logs.map(l => l.acao))).sort();

  const filtrados = logs.filter(l => {
    if (filtroUsuario && l.usuario !== filtroUsuario) return false;
    if (filtroAcao && l.acao !== filtroAcao) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Histórico de atividades por usuário</p>
        </div>
        <button
          onClick={carregar}
          disabled={carregando}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <User size={13} className="text-gray-500" />
          <select
            value={filtroUsuario}
            onChange={e => setFiltroUsuario(e.target.value)}
            className="text-sm bg-white/[0.05] border border-blue-500/20 rounded-lg px-3 py-1.5 text-gray-300 focus:outline-none focus:border-blue-500/40"
          >
            <option value="">Todos os usuários</option>
            {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <select
          value={filtroAcao}
          onChange={e => setFiltroAcao(e.target.value)}
          className="text-sm bg-white/[0.05] border border-blue-500/20 rounded-lg px-3 py-1.5 text-gray-300 focus:outline-none focus:border-blue-500/40"
        >
          <option value="">Todas as ações</option>
          {acoes.map(a => <option key={a} value={a}>{ACOES_LABEL[a] ?? a}</option>)}
        </select>
        <span className="text-xs text-gray-500 self-center font-mono">{filtrados.length} / {logs.length} entradas</span>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-blue-500/10 bg-white/[0.02] overflow-hidden">
        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500 text-sm">
            <Loader2 size={14} className="animate-spin" /> Carregando...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="py-12 text-center text-gray-500 text-sm">Nenhum log encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-blue-500/10">
              <thead className="bg-white/[0.03]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Data/Hora</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Usuário</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ação</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-500/5">
                {filtrados.map(l => (
                  <tr key={l.id} className="hover:bg-blue-500/5 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">{formatarHora(l.timestamp)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-sm text-gray-300">
                        <User size={12} className="text-gray-500" />{l.usuario}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${ACOES_COR[l.acao] ?? 'text-gray-400 bg-white/5 border-white/10'}`}>
                        {ACOES_LABEL[l.acao] ?? l.acao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{l.detalhes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
