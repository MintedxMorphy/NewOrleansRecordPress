import { NextResponse } from 'next/server';
import { getSheet } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

interface InboxEmail {
  email_id: string;
  timestamp: string;
  inbox: string;
  from: string;
  subject: string;
  classification: string;
  confidence: string;
  summary: string;
  action_taken: string;
  job_id: string;
  bill_id: string;
}

export async function GET() {
  try {
    // Read email_log from NORP_OPS_DB
    const emailLog = await getSheet('email_log');

    // Filter to last 48 hours, exclude 'other' classification
    const now = Date.now();
    const hours48Ago = now - 48 * 60 * 60 * 1000;
    
    const filtered = emailLog
      .filter(row => {
        if (!row.timestamp || !row.classification) return false;
        if (row.classification === 'other' || row.classification === 'error') return false;
        
        try {
          const ts = new Date(row.timestamp).getTime();
          return ts >= hours48Ago;
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        // Sort by timestamp descending (newest first)
        try {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        } catch {
          return 0;
        }
      })
      .slice(0, 50); // Cap at 50 rows

    // Count by classification
    const counts: Record<string, number> = {};
    let total = 0;
    filtered.forEach(email => {
      const cls = email.classification || 'other';
      counts[cls] = (counts[cls] || 0) + 1;
      total++;
    });

    return NextResponse.json({
      emails: filtered as InboxEmail[],
      counts: {
        quote_request: counts['quote_request'] || 0,
        order_update: counts['order_update'] || 0,
        vendor_invoice: counts['vendor_invoice'] || 0,
        payment_received: counts['payment_received'] || 0,
        shipping_update: counts['shipping_update'] || 0,
        total,
      },
    });
  } catch (e: any) {
    console.error('[norp-inbox] Error:', e?.message);
    return NextResponse.json({ error: e?.message ?? 'Unknown error', emails: [], counts: { total: 0 } }, { status: 500 });
  }
}
