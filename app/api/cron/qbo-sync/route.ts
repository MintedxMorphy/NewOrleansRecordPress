import { NextRequest, NextResponse } from 'next/server';
import { getARaging, getAPAging, getBankBalances, getMTDRevenue } from '@/lib/qbo';
import { findRow, updateRow, appendRow } from '@/lib/sheets';

async function cacheValue(key: string, value: string) {
  const existing = await findRow('qbo_cache', 'key', key);
  const row = { key, value, updated_at: new Date().toISOString() };
  if (existing) {
    await updateRow('qbo_cache', existing.rowIndex, row);
  } else {
    await appendRow('qbo_cache', row);
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret header (Vercel sets this)
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [ar, ap, banks, mtd] = await Promise.all([
      getARaging(), getAPAging(), getBankBalances(), getMTDRevenue(),
    ]);

    await Promise.all([
      cacheValue('ar_aging', JSON.stringify(ar)),
      cacheValue('ap_aging', JSON.stringify(ap)),
      cacheValue('bank_balances', JSON.stringify(banks)),
      cacheValue('mtd_revenue', String(mtd)),
    ]);

    return NextResponse.json({ ok: true, updated: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
