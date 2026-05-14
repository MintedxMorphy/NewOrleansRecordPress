import { NextResponse } from 'next/server';
import { getSheet } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cache = await getSheet('qbo_cache');
    const get = (key: string) => cache.find((r: any) => r.key === key)?.value ?? null;

    const text = get('latest_briefing_text');
    const date = get('latest_briefing_date');
    const source = get('latest_briefing_source'); // 'email_scan' | 'morning_briefing'

    if (!text) {
      return NextResponse.json({ ok: true, briefing: null });
    }

    return NextResponse.json({
      ok: true,
      briefing: { text, date, source },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
