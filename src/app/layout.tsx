import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import Nav from './components/Nav';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Central de Rastreamento Zen | Zen Seguros',
  description: 'Central de monitoramento e rastreamento de veículos Zen Seguros',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${geist.className} antialiased`}>
        <Nav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
