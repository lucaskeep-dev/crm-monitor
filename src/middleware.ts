import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validarToken, extrairUsuario, COOKIE_NAME } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/login' || pathname === '/api/auth/login') {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!(await validarToken(token))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const usuario = extrairUsuario(token) ?? '';
  const headers = new Headers(req.headers);
  headers.set('x-usuario', usuario);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
