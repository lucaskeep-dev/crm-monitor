// Registra auto-refresh apenas em runtime Node.js (não Edge)
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerAutoRefresh } = await import('./lib/auto-refresh');
    registerAutoRefresh();
  }
}
