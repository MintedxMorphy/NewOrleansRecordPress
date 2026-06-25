import { getShipmentAiApiKey, getShipmentAiModel } from '@/lib/shipment-ai-config';
import type { ExtractedTracking } from '@/lib/shipment-email-extract';

type AiTrackingCandidate = {
  email_id?: string;
  tracking_number?: string;
  carrier?: string;
  confidence?: 'high' | 'medium' | 'low';
  evidence?: string;
};

type AiResponse = {
  trackings?: AiTrackingCandidate[];
};

const CARRIER_SLUGS: Record<string, string> = {
  ups: 'ups',
  fedex: 'fedex',
  'federal express': 'fedex',
  usps: 'usps',
  dhl: 'dhl',
  saia: 'saia-freight',
  'r+l': 'rl-carriers',
  'r+l carriers': 'rl-carriers',
  rl: 'rl-carriers',
  estes: 'estes',
  'old dominion': 'old-dominion',
  xpo: 'xpo-logistics',
  ontrac: 'ontrac',
  'aaa cooper': 'aaa-cooper',
  'aaa cooper transportation': 'aaa-cooper',
  uline: '',
  amazon: '',
  shiprush: '',
};

function normalizeTrackingNumber(value = '') {
  return value
    .replace(/\s+/g, '')
    .replace(/[^\dA-Z-]/gi, '')
    .toUpperCase();
}

function carrierSlug(carrier = '') {
  const normalized = carrier.toLowerCase().replace(/\s+/g, ' ').trim();
  return CARRIER_SLUGS[normalized] ?? normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function carrierLabel(carrier = '') {
  const normalized = carrier.trim();
  if (!normalized || normalized.toLowerCase() === 'unknown') return '';
  return normalized;
}

function looksLikePhoneNumber(value: string) {
  return /^(?:\+?1)?\d{10}$/.test(value.replace(/\D/g, ''));
}

function plausibleTrackingNumber(value: string) {
  const compact = normalizeTrackingNumber(value);
  if (compact.length < 8 || compact.length > 34) return false;
  if (!/\d/.test(compact)) return false;
  if (/^0+$/.test(compact)) return false;
  if (/^(\d)\1+$/.test(compact)) return false;
  if (looksLikePhoneNumber(compact)) return false;
  return true;
}

function parseJsonObject(text: string): AiResponse {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return {};
  return JSON.parse(cleaned.slice(start, end + 1)) as AiResponse;
}

function textFromOpenAi(data: any) {
  if (typeof data.output_text === 'string') return data.output_text;
  const chatText = data.choices?.[0]?.message?.content;
  if (typeof chatText === 'string') return chatText;
  const output = data.output;
  if (Array.isArray(output)) {
    return output
      .flatMap((item: any) => item.content || [])
      .map((content: any) => content.text || '')
      .join('\n');
  }
  return '';
}

export async function extractTrackingCandidatesWithAI(email: {
  from: string;
  subject: string;
  body: string;
}): Promise<ExtractedTracking[]> {
  const apiKey = await getShipmentAiApiKey();
  if (!apiKey) return [];

  const model = await getShipmentAiModel();
  const input = `
FROM: ${email.from}
SUBJECT: ${email.subject}

EMAIL/PDF TEXT:
${email.body.slice(0, 45000)}
`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You extract real package/freight tracking numbers from shipping emails for a record pressing plant.',
            'Return ONLY JSON: {"trackings":[{"tracking_number":"...","carrier":"UPS|FedEx|USPS|DHL|Saia|R+L Carriers|Estes|Old Dominion|XPO|OnTrac|Unknown","confidence":"high|medium|low","evidence":"short quoted context"}]}',
            'Do not return invoice numbers, payment references, order numbers, phone numbers, postal codes, reward/promo numbers, dates, amounts, or account numbers.',
            'Only return a tracking number when the surrounding email context says it is a shipment/tracking/PRO/BOL/waybill/package ID.',
            'For carrier billing emails with only invoice/payment references, return an empty trackings array.',
          ].join(' '),
        },
        {
          role: 'user',
          content: input,
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error?.message || `GPT parser failed (${res.status})`;
    throw new Error(message);
  }

  const parsed = parseJsonObject(textFromOpenAi(data));
  const deduped = new Map<string, ExtractedTracking>();

  for (const candidate of parsed.trackings || []) {
    const trackingNumber = normalizeTrackingNumber(candidate.tracking_number || '');
    if (!plausibleTrackingNumber(trackingNumber)) continue;

    const confidence = candidate.confidence === 'high' || candidate.confidence === 'medium'
      ? candidate.confidence
      : 'medium';
    const carrier = carrierLabel(candidate.carrier || '');

    deduped.set(trackingNumber, {
      tracking_number: trackingNumber,
      carrier,
      slug: carrierSlug(carrier),
      confidence,
      reason: `GPT 5.5 parser${candidate.evidence ? `: ${candidate.evidence.slice(0, 160)}` : ''}`,
    });
  }

  return [...deduped.values()];
}

export async function extractTrackingCandidatesBatchWithAI(emails: Array<{
  id: string;
  from: string;
  subject: string;
  body: string;
}>): Promise<Record<string, ExtractedTracking[]>> {
  const apiKey = await getShipmentAiApiKey();
  if (!apiKey || emails.length === 0) return {};

  const model = await getShipmentAiModel();
  const input = emails.map((email, index) => `
--- EMAIL ${index + 1} ---
EMAIL_ID: ${email.id}
FROM: ${email.from}
SUBJECT: ${email.subject}
TEXT:
${email.body.slice(0, 7000)}
`).join('\n\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You extract real package/freight tracking numbers from batches of shipping emails for a record pressing plant.',
            'Return ONLY JSON: {"trackings":[{"email_id":"exact EMAIL_ID","tracking_number":"...","carrier":"UPS|FedEx|USPS|DHL|Saia|R+L Carriers|Estes|Old Dominion|XPO|OnTrac|Unknown","confidence":"high|medium|low","evidence":"short quoted context"}]}',
            'Do not return invoice numbers, payment references, order numbers, phone numbers, postal codes, reward/promo numbers, dates, amounts, or account numbers.',
            'Only return tracking numbers when surrounding context says it is a shipment/tracking/PRO/BOL/waybill/package ID.',
            'For carrier billing emails with only invoice/payment references, return no tracking for that email.',
          ].join(' '),
        },
        {
          role: 'user',
          content: input,
        },
      ],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error?.message || `GPT batch parser failed (${res.status})`;
    throw new Error(message);
  }

  const parsed = parseJsonObject(textFromOpenAi(data));
  const byEmail: Record<string, ExtractedTracking[]> = {};
  const validEmailIds = new Set(emails.map(email => email.id));

  for (const candidate of parsed.trackings || []) {
    const emailId = String(candidate.email_id || '').trim();
    if (!validEmailIds.has(emailId)) continue;

    const trackingNumber = normalizeTrackingNumber(candidate.tracking_number || '');
    if (!plausibleTrackingNumber(trackingNumber)) continue;

    const confidence = candidate.confidence === 'high' || candidate.confidence === 'medium'
      ? candidate.confidence
      : 'medium';
    const carrier = carrierLabel(candidate.carrier || '');

    const extracted: ExtractedTracking = {
      tracking_number: trackingNumber,
      carrier,
      slug: carrierSlug(carrier),
      confidence,
      reason: `GPT 5.5 batch parser${candidate.evidence ? `: ${candidate.evidence.slice(0, 160)}` : ''}`,
    };

    byEmail[emailId] ||= [];
    if (!byEmail[emailId].some(existing => existing.tracking_number === trackingNumber)) {
      byEmail[emailId].push(extracted);
    }
  }

  return byEmail;
}
