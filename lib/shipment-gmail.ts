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

function extractBodyText(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64Url(payload.body.data).toString('utf-8');
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data).toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      const text = extractBodyText(part);
      if (text) return text;
    }
  }
  return '';
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
    const receivedAt = headerValue(headers, 'Date');

    if (!looksLikeShippingEmail(from, subject) && !body.toLowerCase().includes('tracking')) {
      continue;
    }

    emails.push({
      id: message.id,
      inbox,
      from,
      subject,
      body: `${subject}\n\n${body}`.slice(0, 20000),
      receivedAt,
    });
  }

  return emails;
}
