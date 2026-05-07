'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Settings, SlidersHorizontal, LogOut, Users, ScrollText } from 'lucide-react';
import ZenLogo from './ZenLogo';

const LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/regras-fipe', label: 'Regras FIPE', icon: Settings },
  { href: '/configuracoes', label: 'Configurações', icon: SlidersHorizontal },
  { href: '/usuarios', label: 'Usuários', icon: Users },
  { href: '/logs', label: 'Logs', icon: ScrollText },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') return null;

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-blue-500/10 bg-[#07090f]/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/30 blur-xl rounded-full group-hover:bg-blue-500/50 transition-colors" />
                <div className="relative">
                  <ZenLogo className="w-9 h-9" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-[#07090f] pulse-green" />
              </div>
              <div className="leading-tight">
                <div className="text-[14px] font-bold text-white tracking-tight">
                  Central de Rastreamento
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-blue-400/80 uppercase tracking-[0.15em]">
                  <span className="font-bold text-blue-300">ZEN</span>
                  <span className="text-blue-500/30">·</span>
                  <span>SEGUROS</span>
                </div>
              </div>
            </Link>

            <div className="flex gap-1 ml-4">
              {LINKS.map(({ href, label, icon: Icon }) => {
                const ativo = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      ativo
                        ? 'text-blue-300 bg-blue-500/10'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                    {ativo && (
                      <span className="absolute inset-x-3 -bottom-px h-0.5 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-green" />
              <span>SGA · RDV</span>
              <span className="text-gray-700">|</span>
              <span className="text-blue-400/70">v2.0</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Sair"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
