import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSheet, appendRow } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const isAfternoon = now.getUTCHours() >= 19; // 4 PM CDT = 21:00 UTC; 8 AM CDT = 13:00 UTC
    const label = isAfternoon ? '4 PM' : '8 AM';
    const cutoffHours = isAfternoon ? 9 : 13; // 4pm looks back ~9h to 7am; 8am looks back 13h overnight

    // Read email log and briefings in parallel
    const [emailLog, briefingsSheet] = await Promise.all([
      getSheet('email_log'),
      getSheet('briefings'),
    ]);

    const cutoff = Date.now() - cutoffHours * 60 * 60 * 1000;
    const recentEmails = (emailLog as any[]).filter((e: any) =>
      new Date(e.timestamp || 0).getTime() > cutoff
    );

    // Build classification summary
    const byClass: Record<string, any[]> = {};
    for (const e of recentEmails) {
      const c = e.classification ?? 'other';
      if (!byClass[c]) byClass[c] = [];
      byClass[c].push(e);
    }

    const emailDetail = recentEmails
      .map((e: any) =>
        `[${e.inbox?.split('@')[0] ?? '?'}] ${e.classification} | ${e.from?.split('<')[0].trim().slice(0, 40)} | ${e.subject?.slice(0, 70)}${e.amount_usd ? ` | $${e.amount_usd}` : ''}${e.summary ? ` | ${e.summary}` : ''}`
      )
      .join('\n');

    // Get last briefing to carry forward unresolved items
    const prevBrief = briefingsSheet.length > 0
      ? (briefingsSheet[briefingsSheet.length - 1] as any)?.briefing_text ?? ''
      : '';

    const briefPrompt = `You are the operations intelligence layer for New Orleans Record Press (NORP), a vinyl pressing plant in New Orleans. Write the ${label} update for Gregory, managing partner.

RULES:
- Direct and specific. No greetings, no filler.
- Plain text with ALL-CAPS section headers.
- Include names, dollar amounts, job numbers wherever available.
- CRITICAL: Check the previous briefing for anything urgent or unresolved. If it still hasn't been addressed based on new email activity, repeat it under STILL UNRESOLVED. Don't let things fall through the cracks.
- Only omit a section if there is truly nothing to report.
- Target: 500-700 words.

SECTIONS:
EMAIL SCAN SUMMARY
STILL UNRESOLVED
NEW BUSINESS
ACTIVE ORDER UPDATES
VENDOR INVOICES & BILLS
PAYMENTS RECEIVED
SHIPPING & TRACKING
INTERNAL UPDATES
ACTION ITEMS

SCAN STATS (last ${cutoffHours}h):
- Total emails: ${recentEmails.length}
- Quote requests: ${(byClass.quote_request ?? []).length}
- Order updates: ${(byClass.order_update ?? []).length}
- Vendor invoices: ${(byClass.vendor_invoice ?? []).length}
- Payments received: ${(byClass.payment_received ?? []).length}
- Shipping updates: ${(byClass.shipping_update ?? []).length}
- Team internal: ${(byClass.team_internal ?? []).length}

EMAIL DETAILS:
${emailDetail || '(no new emails this window)'}

PREVIOUS BRIEFING (check for unresolved items):
${prevBrief ? prevBrief.slice(0, 2500) : '(none)'}

Time: ${now.toLocaleString('en-US', { timeZone: 'America/Chicago' })} CDT`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const briefRes = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      messages: [{ role: 'user', content: briefPrompt }],
    });

    const briefText = (briefRes.content[0] as any).text?.trim() ?? '';
    const dateLabel = `${now.toISOString().split('T')[0]} ${label} — ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' })} CDT`;

    // Append to briefings sheet (stacks on dashboard)
    await appendRow('briefings', {
      date: dateLabel,
      briefing_text: briefText,
      source: 'email_scan',
    });

    // Send to Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID || '6912503868';
    if (botToken) {
      const telegramMsg = `📬 *NORP ${label} Brief*\n${recentEmails.length} emails\n\n${briefText.slice(0, 3800)}`;
      const https = await import('https');
      await new Promise<void>((resolve) => {
        const body = JSON.stringify({ chat_id: chatId, text: telegramMsg, parse_mode: 'Markdown' });
        const reqHttp = https.default.request({
          hostname: 'api.telegram.org',
          path: `/bot${botToken}/sendMessage`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, () => resolve());
        reqHttp.on('error', () => resolve());
        reqHttp.write(body);
        reqHttp.end();
      });
    }

    return NextResponse.json({ ok: true, label, emailsInWindow: recentEmails.length, briefLength: briefText.length });
  } catch (e: any) {
    console.error('[gen-brief] Error:', e?.message);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
