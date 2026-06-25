import { type NextRequest, NextResponse } from 'next/server';
import { runShipmentTrackingPipeline } from '@/lib/shipment-pipeline';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
      || process.env.SHIPMENT_TRACKING_DRY_RUN === 'true';
    const backfillDays = req.nextUrl.searchParams.get('backfill');
    const lookbackHours = req.nextUrl.searchParams.get('lookback_hours');
    const inbox = req.nextUrl.searchParams.get('inbox') || undefined;

    const result = await runShipmentTrackingPipeline({
      dryRun,
      inbox,
      backfillDays: backfillDays ? Number(backfillDays) : undefined,
      lookbackHours: lookbackHours ? Number(lookbackHours) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
