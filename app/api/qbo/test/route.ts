import { NextResponse } from 'next/server';
import { getBankBalances, getARaging, getAPAging, getMTDRevenue } from '@/lib/qbo';

export async function GET() {
  try {
    const [banks, ar, ap, mtd] = await Promise.all([
      getBankBalances(),
      getARaging(),
      getAPAging(),
      getMTDRevenue(),
    ]);
    return NextResponse.json({ banks, ar, ap, mtd, realmId: (process.env.QBO_REALM_ID ?? '').trim(), clientIdSet: !!process.env.QBO_CLIENT_ID, secretSet: !!process.env.QBO_CLIENT_SECRET, refreshSet: !!process.env.QBO_REFRESH_TOKEN });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
