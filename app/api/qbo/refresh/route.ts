import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { refreshQBOToken } from '@/lib/qbo';

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const token = await refreshQBOToken();
    return NextResponse.json({ ok: true, message: 'QBO token refreshed', timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to refresh' }, { status: 500 });
  }
}
