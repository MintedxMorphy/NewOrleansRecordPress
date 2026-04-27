import { NextRequest, NextResponse } from 'next/server';
import { getSheet, appendRow } from '@/lib/sheets';

interface YFResult { price: number | null; error?: string }

async function fetchYF(symbol: string): Promise<YFResult> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json() as any;
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    return { price };
  } catch (e: any) {
    return { price: null, error: e?.message };
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [mbr1, wlk, oln, cl1] = await Promise.all([
    fetchYF('MBR1=F'),
    fetchYF('WLK'),
    fetchYF('OLN'),
    fetchYF('CL=F'),
  ]);

  const prices = { mbr1: mbr1.price, wlk: wlk.price, oln: oln.price, cl1: cl1.price };

  // Get previous row for comparison
  const rows = await getSheet('compound_alerts');
  const prev = rows.length > 0 ? rows[rows.length - 1] : null;

  const prevPrices = {
    mbr1: prev ? parseFloat(prev.mbr1_value ?? '0') : null,
    wlk: prev ? parseFloat(prev.wlk_value ?? '0') : null,
    oln: prev ? parseFloat(prev.oln_value ?? '0') : null,
    cl1: prev ? parseFloat(prev.cl1_value ?? '0') : null,
  };

  // Alert logic
  let alertLevel = 'green';
  const messages: string[] = [];

  if (prices.mbr1 && prices.mbr1 > 0.28) {
    alertLevel = 'red';
    messages.push(`MBR1 at $${prices.mbr1.toFixed(4)} (>$0.28 threshold)`);
  }

  const tickers = ['mbr1', 'wlk', 'oln', 'cl1'] as const;
  for (const t of tickers) {
    const cur = prices[t];
    const pre = prevPrices[t];
    if (cur && pre && pre > 0) {
      const pctChange = Math.abs((cur - pre) / pre) * 100;
      if (pctChange > 3) {
        alertLevel = 'red';
        messages.push(`${t.toUpperCase()} moved ${pctChange.toFixed(1)}% (${pre.toFixed(3)} → ${cur.toFixed(3)})`);
      } else if (pctChange > 1.5 && alertLevel !== 'red') {
        alertLevel = 'yellow';
        messages.push(`${t.toUpperCase()} moved ${pctChange.toFixed(1)}%`);
      }
    }
  }

  await appendRow('compound_alerts', {
    timestamp: new Date().toISOString(),
    mbr1_value: prices.mbr1?.toString() ?? '',
    wlk_value: prices.wlk?.toString() ?? '',
    oln_value: prices.oln?.toString() ?? '',
    cl1_value: prices.cl1?.toString() ?? '',
    alert_level: alertLevel,
    message: messages.join('; ') || 'No significant movement',
  });

  return NextResponse.json({ ok: true, alertLevel, prices, messages });
}
