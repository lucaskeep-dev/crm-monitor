export const COOKIE_NAME = 'crm_session';
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(process.env.AUTH_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes.buffer as ArrayBuffer;
}

function b64encode(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64decode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '='));
}

export async function criarToken(usuario: string): Promise<string> {
  const expiry = Date.now() + EXPIRY_MS;
  const payload = `${encodeURIComponent(usuario)}|${expiry}`;
  const key = await getKey();
  const sig = toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return b64encode(`${payload}|${sig}`);
}

export async function validarToken(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.AUTH_SECRET) return false;
  try {
    const decoded = b64decode(token);
    const lastPipe = decoded.lastIndexOf('|');
    const payload = decoded.slice(0, lastPipe);
    const sigHex = decoded.slice(lastPipe + 1);
    const expiry = Number(payload.split('|').pop());
    if (Date.now() > expiry) return false;
    const key = await getKey();
    return await crypto.subtle.verify('HMAC', key, fromHex(sigHex), new TextEncoder().encode(payload));
  } catch { return false; }
}
