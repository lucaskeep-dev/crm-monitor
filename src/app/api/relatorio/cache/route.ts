import { NextResponse } from 'next/server';
import { lerCacheInativos, lerCacheAusentes, lerCacheSemPontuar } from '@/lib/storage';

export async function GET() {
  return NextResponse.json({
    inativos: lerCacheInativos(),
    ausentes: lerCacheAusentes(),
    sem_pontuar: lerCacheSemPontuar(),
  });
}
