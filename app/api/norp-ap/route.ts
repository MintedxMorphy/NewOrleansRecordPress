import { NextResponse } from 'next/server';
import { refreshQBOToken } from '@/lib/qbo';

export const dynamic = 'force-dynamic';

const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';

export async function GET() {
  try {
    const realmId = (process.env.QBO_REALM_ID ?? '').trim();
    const token = await refreshQBOToken();

    const query = encodeURIComponent('SELECT * FROM Bill WHERE Balance > 0 MAXRESULTS 100');
    const res = await fetch(`${QBO_BASE}/${realmId}/query?query=${query}&minorversion=65`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const data = await res.json();
    const bills = data?.QueryResponse?.Bill ?? [];

    const result = bills.map((bill: any) => {
      const totalAmt = parseFloat(bill.TotalAmt ?? '0');
      const balance = parseFloat(bill.Balance ?? '0');
      return {
        id: bill.Id,
        vendorName: bill.VendorRef?.name ?? '',
        totalAmt,
        balance,
        dueDate: bill.DueDate ?? '',
        txnDate: bill.TxnDate ?? '',
        docNumber: bill.DocNumber ?? '',
        privateNote: bill.PrivateNote ?? '',
        status: balance === 0 ? 'paid' :
          new Date(bill.DueDate ?? '') < new Date() ? 'overdue' : 'open',
      };
    });

    result.sort((a: any, b: any) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (b.status === 'overdue' && a.status !== 'overdue') return 1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    return NextResponse.json({ bills: result, total: result.reduce((s: number, b: any) => s + b.balance, 0) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, bills: [], total: 0 }, { status: 500 });
  }
}
