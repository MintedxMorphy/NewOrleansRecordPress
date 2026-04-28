import { NextRequest, NextResponse } from 'next/server';
import { appendRow } from '@/lib/sheets';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customer, format, quantity, stage, notes, contact_email, color } = body;

    if (!customer) {
      return NextResponse.json({ ok: false, error: 'customer is required' }, { status: 400 });
    }

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const jobId = `NORP-${year}${month}${day}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    await appendRow('jobs', {
      job_id: jobId,
      customer,
      contact_email: contact_email ?? '',
      format: format ?? '',
      quantity: quantity != null ? String(quantity) : '',
      color: color ?? '',
      weight_g: '', package_type: '',
      stage: stage ?? 'quote',
      quote_date: now.toISOString().split('T')[0],
      deposit_date: '', ship_date_target: '', pvc_kg_needed: '',
      sleeves_needed: '', jackets_needed: '', labels_needed: '',
      total_price: '', deposit_received: '', balance_due: '',
      assigned_press: '', tracking_number: '', ups_service: '',
      shipping_cost: '', ship_status: '', delivery_date: '',
      notes: notes ?? '',
    });

    return NextResponse.json({ ok: true, job_id: jobId });
  } catch (e: any) {
    console.error('[/api/jobs/create]', e?.message);
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
