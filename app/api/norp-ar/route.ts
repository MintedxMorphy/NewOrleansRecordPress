import { NextResponse } from 'next/server';
import { refreshQBOToken } from '@/lib/qbo';

export const dynamic = 'force-dynamic';

const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';

export async function GET() {
  try {
    const realmId = (process.env.QBO_REALM_ID ?? '').trim();
    const token = await refreshQBOToken();

    const query = encodeURIComponent('SELECT * FROM Invoice WHERE Balance > 0 MAXRESULTS 100');
    const res = await fetch(`${QBO_BASE}/${realmId}/query?query=${query}&minorversion=65`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const data = await res.json();
    const invoices = data?.QueryResponse?.Invoice ?? [];

    const result = invoices.map((inv: any) => {
      const totalAmt = parseFloat(inv.TotalAmt ?? '0');
      const balance = parseFloat(inv.Balance ?? '0');
      return {
        id: inv.Id,
        docNumber: inv.DocNumber ?? '',
        customerName: inv.CustomerRef?.name ?? '',
        matrixId: (inv.PrivateNote ?? inv.CustomerMemo?.value ?? '').trim(),
        totalAmt,
        balance,
        amountPaid: totalAmt - balance,
        dueDate: inv.DueDate ?? '',
        txnDate: inv.TxnDate ?? '',
        status: balance === 0 ? 'paid' : balance < totalAmt ? 'partial' : 'unpaid',
      };
    });

    return NextResponse.json({ invoices: result, total: result.reduce((s: number, i: any) => s + i.balance, 0) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, invoices: [], total: 0 }, { status: 500 });
  }
}
