import { type NextRequest, NextResponse } from 'next/server';
import { registerPendingAfterShipShipments } from '@/lib/shipment-tracking';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const limit = Number(req.nextUrl.searchParams.get('limit') || '25');
    const result = await registerPendingAfterShipShipments(Number.isFinite(limit) ? limit : 25);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
