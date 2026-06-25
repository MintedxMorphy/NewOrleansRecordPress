export const SHIPMENT_INBOXES = [
  'gregory@neworleansrecordpress.com',
  'scott@neworleansrecordpress.com',
  'brice@neworleansrecordpress.com',
  'patrick@neworleansrecordpress.com',
  'accounting@neworleansrecordpress.com',
] as const;

export type ShipmentEmail = {
  id: string;
  inbox: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
};

const SHIPPING_SENDER_HINTS = [
  'ups.com',
  'fedex.com',
  'usps.com',
  'dhl.com',
  'saia.com',
  'alliancelaundry.com',
  'freight',
  'tracking',
  'shipment',
  'shipnotice',
  'ontrac.com',
  'rlcarriers.com',
  'estes-express.com',
  'xpo.com',
  'olddominionfreight.com',
];

const SHIPPING_SUBJECT_HINTS = [
  'shipment',
  'tracking',
  'shipped',
  'delivery',
  'on the way',
  'out for delivery',
  'pickup scheduled',
  'freight',
];

export function looksLikeShippingEmail(from: string, subject: string) {
  const haystack = `${from} ${subject}`.toLowerCase();
  return SHIPPING_SENDER_HINTS.some(hint => haystack.includes(hint))
    || SHIPPING_SUBJECT_HINTS.some(hint => haystack.includes(hint));
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|tr|li|table|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim(),
  );
}

function collectBodyTexts(payload: any): string[] {
  if (!payload) return [];
  const texts: string[] = [];

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data).toString('utf-8');
    if (payload.mimeType === 'text/html') texts.push(htmlToText(decoded));
    else texts.push(decoded);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      texts.push(...collectBodyTexts(part));
    }
  }

  return texts.filter(Boolean);
}

function extractBodyText(payload: any): string {
  return [...new Set(collectBodyTexts(payload))]
    .join('\n\n')
    .slice(0, 50000);
}

async function extractPdfText(buf: Buffer): Promise<string> {
  try {
    // Dynamic require avoids Next.js build-time module evaluation.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse/lib/pdf-parse');
    const data = await pdfParse(buf);
    return (data.text ?? '').slice(0, 5000);
  } catch {
    return '';
  }
}

async function extractAllPdfText(gmail: any, messageId: string, parts: any[] = []): Promise<string> {
  const pdfTexts: string[] = [];

  const walk = async (partList: any[]) => {
    for (const part of partList) {
      const filename = String(part.filename || '');
      if (filename && part.body?.attachmentId && (part.mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf'))) {
        try {
          const attachment = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId,
            id: part.body.attachmentId,
          });
          if (attachment.data.data) {
            const text = await extractPdfText(decodeBase64Url(attachment.data.data));
            if (text) pdfTexts.push(`[PDF: ${filename}]\n${text}`);
          }
        } catch {
          // Ignore attachment parse failures so one bad PDF does not block the inbox scan.
        }
      }
      if (part.parts) await walk(part.parts);
    }
  };

  await walk(parts);
  return pdfTexts.join('\n\n');
}

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  return headers?.find(header => header.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

export function buildShippingGmailQuery(afterEpochSeconds: number) {
  const senders = [
    'ups.com',
    'fedex.com',
    'usps.com',
    'dhl.com',
    'saia.com',
    'rlcarriers.com',
    'estes-express.com',
    'ontrac.com',
  ];
  const fromClause = senders.map(sender => `from:${sender}`).join(' OR ');
  return `after:${afterEpochSeconds} (${fromClause} OR subject:(tracking OR shipment OR shipped OR delivery))`;
}

export async function fetchShipmentEmails(
  gmail: any,
  inbox: string,
  afterEpochSeconds: number,
  maxResults = 50,
): Promise<ShipmentEmail[]> {
  const query = buildShippingGmailQuery(afterEpochSeconds);
  const list = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults,
  });

  const emails: ShipmentEmail[] = [];
  for (const message of list.data.messages || []) {
    if (!message.id) continue;
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'full',
    });

    const headers = full.data.payload?.headers || [];
    const from = headerValue(headers, 'From');
    const subject = headerValue(headers, 'Subject');
    const body = extractBodyText(full.data.payload);
    const pdfText = await extractAllPdfText(gmail, message.id, full.data.payload?.parts || []);
    const receivedAt = headerValue(headers, 'Date');

    const searchableBody = [body, pdfText].filter(Boolean).join('\n\n');

    if (!looksLikeShippingEmail(from, subject) && !searchableBody.toLowerCase().includes('tracking')) {
      continue;
    }

    emails.push({
      id: message.id,
      inbox,
      from,
      subject,
      body: `${subject}\n\n${searchableBody}`.slice(0, 50000),
      receivedAt,
    });
  }

  return emails;
}
