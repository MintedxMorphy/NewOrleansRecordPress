import { NextResponse } from 'next/server';
import { refreshQBOToken } from '@/lib/qbo';

const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';

export async function GET() {
  const realmId = (process.env.QBO_REALM_ID ?? '').trim();
  try {
    const token = await refreshQBOToken();

    // Try to get company info
    const companyRes = await fetch(`${QBO_BASE}/${realmId}/companyinfo/${realmId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const companyData = await companyRes.json();

    // Try raw bank query
    const bankRes = await fetch(`${QBO_BASE}/${realmId}/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType IN ('Bank','Credit Card') MAXRESULTS 10")}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const bankData = await bankRes.json();

    return NextResponse.json({
      realmId,
      clientIdSet: !!process.env.QBO_CLIENT_ID,
      secretSet: !!process.env.QBO_CLIENT_SECRET,
      refreshSet: !!process.env.QBO_REFRESH_TOKEN,
      tokenOk: !!token,
      companyInfo: companyData?.CompanyInfo ?? companyData,
      bankRaw: bankData?.QueryResponse ?? bankData,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message, realmId }, { status: 500 });
  }
}
