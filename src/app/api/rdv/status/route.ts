import { NextResponse } from 'next/server';
import { verificarBlacklistRDV } from '@/lib/rdv';

export async function GET() {
  const r = await verificarBlacklistRDV();
  return NextResponse.json(r);
}
