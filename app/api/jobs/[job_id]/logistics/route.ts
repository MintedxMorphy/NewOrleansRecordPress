import { type NextRequest, NextResponse } from 'next/server';
import {
  createJobShipment,
  getJobLogistics,
  type CreateJobShipmentInput,
  type ShipmentDirection,
} from '@/lib/airtable-shipments';
import { isAirtableConfigured } from '@/lib/airtable';

function parseDirection(value: unknown): ShipmentDirection {
  return String(value || '').toLowerCase().includes('out') ? 'outbound' : 'inbound';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  try {
    const { job_id } = await params;

    if (!isAirtableConfigured()) {
      return NextResponse.json({ error: 'Airtable is not configured' }, { status: 500 });
    }

    const logistics = await getJobLogistics(job_id);
    return NextResponse.json({ ok: true, ...logistics });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.toLowerCase().includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  try {
    const { job_id } = await params;
    const body = await req.json() as CreateJobShipmentInput;

    if (!isAirtableConfigured()) {
      return NextResponse.json({ error: 'Airtable is not configured' }, { status: 500 });
    }

    const shipment = await createJobShipment(job_id, {
      ...body,
      direction: parseDirection(body.direction),
      total_cost: body.total_cost === undefined || body.total_cost === null
        ? 0
        : Number(body.total_cost),
    });

    const logistics = await getJobLogistics(job_id);
    return NextResponse.json({ ok: true, shipment, ...logistics });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.toLowerCase().includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
