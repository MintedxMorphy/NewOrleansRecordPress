import { NextResponse } from 'next/server';
import { getBankBalances, getARaging, getAPAging, getMTDRevenue } from '@/lib/qbo';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [bankAccounts, arAging, apAging, mtdRevenue] = await Promise.all([
      getBankBalances().catch(() => []),
      getARaging().catch(() => ({ total: 0, buckets: { current: 0, days30: 0, days60: 0, days90plus: 0 } })),
      getAPAging().catch(() => ({ total: 0, pendingBills: 0 })),
      getMTDRevenue().catch(() => 0),
    ]);

    return NextResponse.json({ bankAccounts, arAging, apAging, mtdRevenue, nextPayroll: null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
