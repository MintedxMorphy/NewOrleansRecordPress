import { NextResponse } from 'next/server';
import { getSheet } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await getSheet('briefings');
    if (!rows.length) return NextResponse.json({ ok: true, briefings: [] });

    // Return last 30, newest first
    const briefings = rows
      .filter((r: any) => r.briefing_text)
      .slice(-30)
      .reverse()
      .map((r: any) => ({
        text: r.briefing_text,
        date: r.date,
        source: r.source ?? 'morning_briefing',
      }));

    return NextResponse.json({ ok: true, briefings });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
