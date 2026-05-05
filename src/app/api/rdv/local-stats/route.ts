import { NextResponse } from 'next/server';
import { statsRdvLocal } from '@/lib/rdv-local';

export async function GET() {
  const stats = statsRdvLocal();
  if (!stats) return NextResponse.json({ ok: false });
  return NextResponse.json({ ok: true, ...stats });
}
