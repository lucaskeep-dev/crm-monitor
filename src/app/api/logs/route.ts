import { NextResponse } from 'next/server';
import { lerLogs } from '@/lib/logs';

export async function GET() {
  return NextResponse.json(lerLogs());
}
