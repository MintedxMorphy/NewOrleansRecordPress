import { NextRequest, NextResponse } from 'next/server';
import { appendRow } from '@/lib/sheets';

export async function POST(req: NextRequest) {
  try {
    const { tab, row } = await req.json() as { tab: string; row: Record<string, string> };
    if (!tab || !row) return NextResponse.json({ error: 'tab and row required' }, { status: 400 });
    await appendRow(tab, row);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
