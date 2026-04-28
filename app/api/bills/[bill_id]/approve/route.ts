import { NextRequest, NextResponse } from 'next/server';
import { findRow, updateRow } from '@/lib/sheets';
import { createDraftBill } from '@/lib/qbo';

export async function POST(req: NextRequest, { params }: { params: Promise<{ bill_id: string }> }) {
  try {
    const { bill_id } = await params;
    const found = await findRow('bills_inbox', 'email_id', bill_id);
    if (!found) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    const bill = found.row;
    const result = await createDraftBill({
      vendorName: bill.vendor_guess || bill.sender,
      amount: parseFloat(bill.amount_usd ?? '0'),
      dueDate: bill.due_date || new Date().toISOString().split('T')[0],
      invoiceNumber: bill.invoice_number,
      lineDescription: `Invoice from ${bill.vendor_guess || bill.sender}`,
    });

    const updated = {
      ...bill,
      status: result.duplicate ? 'duplicate' : result.vendorNotFound ? 'vendor_not_found' : result.ok ? 'imported_to_qbo' : 'error',
      qbo_bill_id: result.billId ?? bill.qbo_bill_id ?? '',
      notes: result.error ? `QBO error: ${result.error}` : result.duplicate ? `Duplicate of bill ${result.existingBillId}` : result.vendorNotFound ? 'Vendor not found in QBO' : bill.notes ?? '',
    };
    await updateRow('bills_inbox', found.rowIndex, updated);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
