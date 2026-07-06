import { type NextRequest, NextResponse } from 'next/server';
import { resolveShipmentBackfillBatch, runShipmentTrackingPipeline } from '@/lib/shipment-pipeline';
import { syncAfterShipTrackingsToSheet } from '@/lib/shipment-aftership-sync';

function optionalNumber(value: string | null) {
  if (value === null || value.trim() === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid number: ${value}`);
  return number;
}

function nextBatchUrl(req: NextRequest, batch: { next_batch_index: number | null; batch_anchor_epoch_seconds: number }) {
  if (batch.next_batch_index === null) return undefined;
  const url = req.nextUrl.clone();
  url.searchParams.set('batch', String(batch.next_batch_index));
  url.searchParams.set('batch_anchor', String(batch.batch_anchor_epoch_seconds));
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (req.nextUrl.searchParams.get('sync_aftership') === '1') {
      const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';
      const maxPages = optionalNumber(req.nextUrl.searchParams.get('max_pages')) ?? 10;
      const result = await syncAfterShipTrackingsToSheet({ maxPages, dryRun });
      return NextResponse.json({ ok: result.ok, sync_aftership: true, ...result });
    }

    const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
      || process.env.SHIPMENT_TRACKING_DRY_RUN === 'true';
    const backfillDays = optionalNumber(req.nextUrl.searchParams.get('backfill'));
    const lookbackHours = optionalNumber(req.nextUrl.searchParams.get('lookback_hours'));
    const batchDays = optionalNumber(req.nextUrl.searchParams.get('batch_days'));
    const batchIndex = optionalNumber(req.nextUrl.searchParams.get('batch'))
      ?? optionalNumber(req.nextUrl.searchParams.get('batch_index'));
    const batchAnchor = optionalNumber(req.nextUrl.searchParams.get('batch_anchor'));
    const inbox = req.nextUrl.searchParams.get('inbox') || undefined;
    const batch = batchDays !== undefined
      ? resolveShipmentBackfillBatch({
        backfillDays: backfillDays ?? 30,
        batchDays,
        batchIndex,
        batchAnchorEpochSeconds: batchAnchor,
      })
      : undefined;

    const result = await runShipmentTrackingPipeline({
      dryRun,
      inbox,
      backfillDays,
      lookbackHours,
      windowStartEpochSeconds: batch?.window_start_epoch_seconds,
      windowEndEpochSeconds: batch?.window_end_epoch_seconds,
      batch,
      skipPoll: batch ? batch.next_batch_index !== null : undefined,
    });

    return NextResponse.json({
      ...result,
      next_batch_url: batch ? nextBatchUrl(req, batch) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
