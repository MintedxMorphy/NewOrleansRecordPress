import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { refreshGustoToken } from '@/lib/gusto';

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await refreshGustoToken();
    return NextResponse.json({ ok: true, message: 'Gusto token refreshed', timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to refresh' }, { status: 500 });
  }
}
