import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_API_VERSION = '2026-01';

export type AfterShipCustomFields = Record<string, string>;

export type AfterShipTrackingPayload = {
  id?: string;
  tracking_number?: string;
  slug?: string;
  tag?: string;
  subtag?: string;
  subtag_message?: string;
  shipment_pickup_date?: string | null;
  shipment_delivery_date?: string | null;
  courier_estimated_delivery_date?: {
    estimated_delivery_date?: string | null;
    estimated_delivery_date_min?: string | null;
    estimated_delivery_date_max?: string | null;
  } | null;
  custom_fields?: AfterShipCustomFields | null;
  checkpoints?: Array<{
    tag?: string;
    message?: string;
    checkpoint_time?: string;
  }>;
};

export type AfterShipWebhookEvent = {
  event_id?: string;
  event?: string;
  msg?: AfterShipTrackingPayload;
};

export type RegisterAfterShipTrackingInput = {
  tracking_number: string;
  carrier?: string;
  title?: string;
  custom_fields?: AfterShipCustomFields;
};

export type AfterShipTrackingUpdate = {
  aftership_id: string;
  tracking_number: string;
  carrier_slug: string;
  carrier_label: string;
  status: string;
  status_detail: string;
  shipped_date: string;
  est_delivery: string;
  delivered_date: string;
  airtable_record_id: string;
};

function afterShipApiKey() {
  return process.env.AFTERSHIP_API_KEY || process.env.AFTERSHIP_API_KEY_V2;
}

function afterShipWebhookSecret() {
  return process.env.AFTERSHIP_WEBHOOK_SECRET;
}

function afterShipApiVersion() {
  return process.env.AFTERSHIP_API_VERSION || DEFAULT_API_VERSION;
}

export function isAfterShipConfigured() {
  return Boolean(afterShipApiKey());
}

export function isAfterShipWebhookConfigured() {
  return Boolean(afterShipWebhookSecret());
}

function afterShipHeaders() {
  const apiKey = afterShipApiKey();
  if (!apiKey) throw new Error('Missing AFTERSHIP_API_KEY');
  return {
    'Content-Type': 'application/json',
    'as-api-key': apiKey,
  };
}

function afterShipUrl(path: string) {
  return `https://api.aftership.com/tracking/${afterShipApiVersion()}${path}`;
}

const CARRIER_SLUGS: Array<[RegExp, string]> = [
  [/\bups\b/i, 'ups'],
  [/\bfedex\b/i, 'fedex'],
  [/\busps\b/i, 'usps'],
  [/\bdhl\b/i, 'dhl'],
  [/\bontrac\b/i, 'ontrac'],
  [/\blaser\s*ship\b/i, 'lasership'],
  [/\bamazon\b/i, 'amazon'],
  [/\bpurolator\b/i, 'purolator'],
  [/\bcanada\s*post\b/i, 'canada-post'],
  [/\broadrunner\b|\br\s*&\s*l\b|\brl\s*carriers\b/i, 'rl-carriers'],
  [/\bestes\b/i, 'estes'],
  [/\bsaia\b/i, 'saia'],
  [/\bxpo\b/i, 'xpo-logistics'],
  [/\bold\s*dominion\b|\bodu\b/i, 'old-dominion'],
  [/\bfreight\b|\bltl\b/i, 'other'],
];

export function normalizeTrackingNumber(value: string) {
  return value.replace(/\s+/g, '').trim().toUpperCase();
}

export function carrierSlugFromName(carrier = '') {
  const normalized = carrier.trim();
  if (!normalized) return '';

  for (const [pattern, slug] of CARRIER_SLUGS) {
    if (pattern.test(normalized)) return slug;
  }

  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function carrierLabelFromSlug(slug = '') {
  const labels: Record<string, string> = {
    ups: 'UPS',
    fedex: 'FedEx',
    usps: 'USPS',
    dhl: 'DHL',
    ontrac: 'OnTrac',
    lasership: 'LaserShip',
    amazon: 'Amazon',
    purolator: 'Purolator',
    'canada-post': 'Canada Post',
    'rl-carriers': 'R+L Carriers',
    estes: 'Estes',
    saia: 'Saia',
    'xpo-logistics': 'XPO Logistics',
    'old-dominion': 'Old Dominion',
  };

  return labels[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function afterShipStatusLabel(tag = '', subtagMessage = '') {
  const labels: Record<string, string> = {
    Pending: 'Pending',
    InfoReceived: 'Label created',
    InTransit: 'In transit',
    OutForDelivery: 'Out for delivery',
    AttemptFail: 'Delivery attempt failed',
    Delivered: 'Delivered',
    AvailableForPickup: 'Available for pickup',
    Exception: 'Exception',
    Expired: 'Tracking expired',
  };

  const base = labels[tag] || tag || 'In transit';
  if (subtagMessage && subtagMessage.toLowerCase() !== base.toLowerCase()) {
    return `${base} — ${subtagMessage}`;
  }
  return base;
}

function isoDateOnly(value: string | null | undefined) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, 10);
}

function pickEstimatedDelivery(payload: AfterShipTrackingPayload) {
  const edd = payload.courier_estimated_delivery_date;
  return isoDateOnly(
    edd?.estimated_delivery_date
    || edd?.estimated_delivery_date_max
    || edd?.estimated_delivery_date_min
    || '',
  );
}

export function parseAfterShipTrackingUpdate(payload: AfterShipWebhookEvent): AfterShipTrackingUpdate | null {
  const msg = payload.msg;
  if (!msg?.tracking_number) return null;

  const tag = msg.tag || '';
  const statusDetail = msg.subtag_message || msg.checkpoints?.[msg.checkpoints.length - 1]?.message || '';
  const deliveredDate = tag === 'Delivered'
    ? isoDateOnly(msg.shipment_delivery_date || msg.checkpoints?.[msg.checkpoints.length - 1]?.checkpoint_time)
    : '';

  return {
    aftership_id: msg.id || '',
    tracking_number: normalizeTrackingNumber(msg.tracking_number),
    carrier_slug: msg.slug || '',
    carrier_label: carrierLabelFromSlug(msg.slug || ''),
    status: afterShipStatusLabel(tag, statusDetail),
    status_detail: statusDetail,
    shipped_date: isoDateOnly(msg.shipment_pickup_date),
    est_delivery: pickEstimatedDelivery(msg),
    delivered_date: deliveredDate,
    airtable_record_id: msg.custom_fields?.airtable_record_id || '',
  };
}

export function verifyAfterShipWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const secret = afterShipWebhookSecret();
  if (!secret) return !signatureHeader;
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const received = signatureHeader.trim();

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

type AfterShipApiEnvelope<T> = {
  data?: T;
  meta?: { code?: number; message?: string; type?: string };
};

type AfterShipCreateResponse = AfterShipApiEnvelope<{ id?: string; tracking_number?: string; slug?: string; tag?: string }>;

export async function registerAfterShipTracking(input: RegisterAfterShipTrackingInput) {
  if (!isAfterShipConfigured()) {
    throw new Error('AfterShip is not configured');
  }

  const trackingNumber = normalizeTrackingNumber(input.tracking_number);
  if (!trackingNumber) {
    throw new Error('Tracking number is required');
  }

  const body: Record<string, unknown> = {
    tracking_number: trackingNumber,
  };

  const slug = carrierSlugFromName(input.carrier || '');
  if (slug && slug !== 'other') body.slug = slug;

  if (input.title) body.title = input.title;
  if (input.custom_fields && Object.keys(input.custom_fields).length) {
    body.custom_fields = input.custom_fields;
  }

  const res = await fetch(afterShipUrl('/trackings'), {
    method: 'POST',
    headers: afterShipHeaders(),
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as AfterShipCreateResponse & {
    meta?: { code?: number; message?: string; type?: string };
  };

  if (res.ok) {
    return {
      created: true,
      id: data.data?.id || '',
      tracking_number: data.data?.tracking_number || trackingNumber,
      slug: data.data?.slug || slug,
      tag: data.data?.tag || 'Pending',
    };
  }

  const metaCode = data.meta?.code;
  const metaType = data.meta?.type || '';
  if (metaCode === 4003 || metaType === 'TRACKING_ALREADY_EXIST') {
    return {
      created: false,
      already_exists: true,
      tracking_number: trackingNumber,
      slug,
      tag: '',
    };
  }

  throw new Error(data.meta?.message || `AfterShip create tracking failed (${res.status})`);
}
