import { NextRequest, NextResponse } from 'next/server';
import { extractUploadedFileText } from '@/lib/pdf-text';
import { parseVendorInvoiceTextWithAi } from '@/lib/vendor-invoice-import';

export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = [...form.values()].find((item): item is File => item instanceof File && item.size > 0);
    const vendorHint = String(form.get('vendor') || '').trim();
    const categoryHint = String(form.get('category') || '').trim();

    if (!file) {
      return NextResponse.json({ error: 'Attach an invoice file first' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Invoice upload is too large. Keep files under 18 MB.' }, { status: 413 });
    }

    const text = (await extractUploadedFileText(file)).trim();
    if (!text) {
      return NextResponse.json({ error: 'Could not extract text from that invoice' }, { status: 400 });
    }

    return NextResponse.json(await parseVendorInvoiceTextWithAi({
      text,
      vendorHint,
      categoryHint,
      sourceFile: file.name,
    }));
  } catch (error) {
    console.error('[vendor-invoices/parse] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
