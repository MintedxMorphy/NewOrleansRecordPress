import { type NextRequest, NextResponse } from 'next/server';
import { getAfterShipApiKey, isAfterShipReady, saveAfterShipApiKey } from '@/lib/aftership-config';
import { testAfterShipConnection } from '@/lib/aftership';
import { runShipmentTrackingPipeline } from '@/lib/shipment-pipeline';
import { getShipmentAiApiKey, getShipmentAiModel, isShipmentAiReady, saveShipmentAiApiKey } from '@/lib/shipment-ai-config';
import { verifyAdminPassword } from '@/lib/team-data';
import { hasServiceAccount } from '@/lib/google-auth';

export async function GET() {
  const key = await getAfterShipApiKey();
  const aiKey = await getShipmentAiApiKey();
  const connection = key ? await testAfterShipConnection() : { ok: false as const, error: 'No API key' };

  return NextResponse.json({
    aftership_key_set: Boolean(key),
    aftership_key_source: process.env.AFTERSHIP_API_KEY || process.env.AFTERSHIP_API_KEY_V2 ? 'env' : (key ? 'qbo_cache' : 'none'),
    aftership_connection: connection,
    shipment_ai_key_set: Boolean(aiKey),
    shipment_ai_key_source: process.env.OPENAI_API_KEY || process.env.SHIPMENT_TRACKING_OPENAI_API_KEY ? 'env' : (aiKey ? 'qbo_cache' : 'none'),
    shipment_ai_model: await getShipmentAiModel(),
    service_account: hasServiceAccount(),
    sheets_db: Boolean(process.env.SHEETS_DB_ID),
    dry_run_default: process.env.SHIPMENT_TRACKING_DRY_RUN === 'true',
    webhook_url: 'https://www.nolavinyl.com/api/webhooks/aftership',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      password?: string;
      action?: 'save_key' | 'save_ai_key' | 'run' | 'test';
      aftership_api_key?: string;
      shipment_ai_api_key?: string;
      dry_run?: boolean;
      inbox?: string;
      backfill?: number;
      lookback_hours?: number;
    };

    if (!verifyAdminPassword(String(body.password || ''))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (body.action === 'save_key') {
      await saveAfterShipApiKey(String(body.aftership_api_key || ''));
      const connection = await testAfterShipConnection();
      return NextResponse.json({ ok: true, saved: true, connection });
    }

    if (body.action === 'save_ai_key') {
      await saveShipmentAiApiKey(String(body.shipment_ai_api_key || ''));
      return NextResponse.json({
        ok: true,
        saved: true,
        shipment_ai_key_set: await isShipmentAiReady(),
        shipment_ai_model: await getShipmentAiModel(),
      });
    }

    if (body.action === 'test') {
      const connection = await testAfterShipConnection();
      return NextResponse.json({
        ok: connection.ok,
        connection,
        configured: await isAfterShipReady(),
        shipment_ai_key_set: await isShipmentAiReady(),
        shipment_ai_model: await getShipmentAiModel(),
      });
    }

    const dryRun = body.dry_run !== false;
    const result = await runShipmentTrackingPipeline({
      dryRun,
      inbox: body.inbox,
      backfillDays: body.backfill,
      lookbackHours: body.lookback_hours,
    });

    return NextResponse.json({ ok: result.ok, dry_run: dryRun, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
