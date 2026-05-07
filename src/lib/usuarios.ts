import fs from 'fs';
import path from 'path';

const USUARIOS_FILE = path.join(process.cwd(), 'data', 'usuarios.json');

export interface Usuario {
  id: string;
  usuario: string;
  senhaHash: string; // pbkdf2:saltHex:hashHex
  criadoEm: string;
  ultimoAcesso?: string;
}

export function lerUsuarios(): Usuario[] {
  try {
    if (!fs.existsSync(USUARIOS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USUARIOS_FILE, 'utf-8')) as Usuario[];
  } catch { return []; }
}

export function salvarUsuarios(usuarios: Usuario[]): void {
  fs.mkdirSync(path.dirname(USUARIOS_FILE), { recursive: true });
  fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuarios, null, 2), 'utf-8');
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as ArrayBuffer, iterations: 100000 },
    keyMat, 256,
  );
  return `pbkdf2:${toHex(salt.buffer as ArrayBuffer)}:${toHex(bits)}`;
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  try {
    const [, saltHex, hashHex] = hash.split(':');
    const salt = fromHex(saltHex);
    const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as ArrayBuffer, iterations: 100000 },
      keyMat, 256,
    );
    return toHex(bits) === hashHex;
  } catch { return false; }
}
