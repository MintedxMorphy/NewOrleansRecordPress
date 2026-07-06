import { NextRequest, NextResponse } from 'next/server';
import { createVendorCostRows, type VendorCostRowInput } from '@/lib/airtable-vendor-costs';

export const dynamic = 'force-dynamic';

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function parseNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = stringValue(value).replace(/[$,]/g, '').trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowsFromBody(body: unknown): VendorCostRowInput[] {
  const shaped = body as { rows?: unknown; confirmed_rows?: unknown; line_items?: unknown; invoice?: Record<string, unknown> };
  const rawRows = Array.isArray(shaped.rows)
    ? shaped.rows
    : Array.isArray(shaped.confirmed_rows)
      ? shaped.confirmed_rows
      : Array.isArray(shaped.line_items)
        ? shaped.line_items
        : [];
  const invoice = shaped.invoice || {};

  return rawRows.map((raw): VendorCostRowInput | null => {
    const row = raw as Record<string, unknown>;
    if (row.skipped === true) return null;

    const amount = parseNumber(row.amount);
    if (!amount) return null;

    return {
      invoice_number: stringValue(row.invoice_number || invoice.invoice_number).trim(),
      vendor: stringValue(row.vendor || invoice.vendor).trim(),
      category: stringValue(row.category || 'Other').trim(),
      matrix: stringValue(row.matrix).trim(),
      customer: stringValue(row.customer || (row.matched_job as Record<string, unknown> | undefined)?.customer).trim(),
      job_id: stringValue(row.job_id || (row.matched_job as Record<string, unknown> | undefined)?.job_id).trim(),
      description: stringValue(row.description).trim(),
      quantity: parseNumber(row.quantity),
      unit_cost: parseNumber(row.unit_cost),
      amount,
      invoice_date: stringValue(row.invoice_date || invoice.invoice_date).trim(),
      source_file: stringValue(row.source_file || invoice.source_file).trim(),
      raw_line: stringValue(row.raw_line || row.description).trim(),
      match_confidence: stringValue(row.confidence || row.match_confidence).trim(),
    };
  }).filter((row): row is VendorCostRowInput => Boolean(row));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rows = rowsFromBody(body);

    if (!rows.length) {
      return NextResponse.json({ error: 'Confirm at least one invoice line with an amount before applying' }, { status: 400 });
    }

    const result = await createVendorCostRows(rows);
    return NextResponse.json({
      ok: true,
      created_count: result.created.length,
      skipped_count: result.skipped.length,
      created: result.created,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error('[vendor-invoices/apply] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
