import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceAgentStatus, runInvoiceAgentCrawlPass } from '@/lib/qbo-invoice-crawler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const state = await getInvoiceAgentStatus();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load invoice agent status';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      limit?: unknown;
      jobKey?: unknown;
      force?: unknown;
      forceAll?: unknown;
      forceQboRefresh?: unknown;
    };

    const limit = body.limit !== undefined ? Number(body.limit) : 250;
    const jobKey = typeof body.jobKey === 'string' && body.jobKey.trim() ? body.jobKey.trim() : undefined;
    const force = Boolean(body.force);
    const forceAll = Boolean(body.forceAll);
    const forceQboRefresh = Boolean(body.forceQboRefresh);

    const result = await runInvoiceAgentCrawlPass({
      limit: Number.isFinite(limit) ? limit : 250,
      jobKey,
      force,
      forceAll,
      forceQboRefresh,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invoice agent crawl failed';
    console.error('[api/qbo/invoice-agent] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
