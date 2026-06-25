import { type NextRequest, NextResponse } from 'next/server';
import { isAfterShipWebhookConfigured, verifyAfterShipWebhookSignature, type AfterShipWebhookEvent } from '@/lib/aftership';
import { handleAfterShipWebhookEvent } from '@/lib/shipment-tracking';

function unauthorizedBearer(req: NextRequest) {
  const expected = process.env.AFTERSHIP_WEBHOOK_BEARER;
  if (!expected) return false;

  const auth = req.headers.get('authorization') || '';
  return auth !== `Bearer ${expected}`;
}

export async function POST(req: NextRequest) {
  try {
    if (unauthorizedBearer(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('aftership-hmac-sha256');

    if (isAfterShipWebhookConfigured() && !verifyAfterShipWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid AfterShip signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as AfterShipWebhookEvent;
    const result = await handleAfterShipWebhookEvent(payload);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
