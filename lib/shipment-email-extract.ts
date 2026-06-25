export type ExtractedTracking = {
  tracking_number: string;
  carrier: string;
  slug: string;
  confidence: 'high' | 'medium';
  reason: string;
};

const CONTEXT_KEYWORD = /\b(?:tracking(?:\s*(?:number|#|no\.?|id))?|track(?:ing)?\s*(?:#|number|no\.?)|shipment(?:\s*(?:id|number|#))?|pro(?:\s*(?:number|#|no\.?))?|bol(?:\s*(?:number|#|no\.?))?|waybill|pickup(?:\s*confirmation)?)\b/i;

const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/;

type CarrierRule = {
  carrier: string;
  slug: string;
  senderPatterns: RegExp[];
  patterns: Array<{
    regex: RegExp;
    requiresSender: boolean;
    requiresContext: boolean;
    confidence: 'high' | 'medium';
  }>;
};

const CARRIER_RULES: CarrierRule[] = [
  {
    carrier: 'UPS',
    slug: 'ups',
    senderPatterns: [/ups\.com/i, /upsfreight\.com/i, /upsmailinnovations\.com/i],
    patterns: [
      { regex: /\b(1Z[0-9A-Z]{16})\b/gi, requiresSender: false, requiresContext: true, confidence: 'high' },
      { regex: /\b(T\d{10})\b/gi, requiresSender: true, requiresContext: true, confidence: 'medium' },
    ],
  },
  {
    carrier: 'FedEx',
    slug: 'fedex',
    senderPatterns: [/fedex\.com/i, /fedexfreight\.com/i],
    patterns: [
      { regex: /\b(\d{12,22})\b/g, requiresSender: true, requiresContext: true, confidence: 'high' },
      { regex: /\b(\d{34})\b/g, requiresSender: true, requiresContext: true, confidence: 'medium' },
    ],
  },
  {
    carrier: 'USPS',
    slug: 'usps',
    senderPatterns: [/usps\.com/i, /email\.usps\.com/i],
    patterns: [
      { regex: /\b(9[0-9]{20,26})\b/g, requiresSender: true, requiresContext: true, confidence: 'high' },
      { regex: /\b([A-Z]{2}\d{9}US)\b/gi, requiresSender: true, requiresContext: true, confidence: 'high' },
    ],
  },
  {
    carrier: 'DHL',
    slug: 'dhl',
    senderPatterns: [/dhl\.com/i, /dhl-usa\.com/i],
    patterns: [
      { regex: /\b(\d{10,11})\b/g, requiresSender: true, requiresContext: true, confidence: 'medium' },
      { regex: /\b([0-9]{3,4}[0-9]{4,8})\b/g, requiresSender: true, requiresContext: true, confidence: 'medium' },
    ],
  },
  {
    carrier: 'Saia',
    slug: 'saia-freight',
    senderPatterns: [/saia\.com/i],
    patterns: [
      { regex: /\b(\d{8,12})\b/g, requiresSender: true, requiresContext: true, confidence: 'high' },
    ],
  },
  {
    carrier: 'R+L Carriers',
    slug: 'rl-carriers',
    senderPatterns: [/rlcarriers\.com/i],
    patterns: [
      { regex: /\b([A-Z0-9]{8,12})\b/gi, requiresSender: true, requiresContext: true, confidence: 'medium' },
    ],
  },
  {
    carrier: 'Estes',
    slug: 'estes',
    senderPatterns: [/estes-express\.com/i],
    patterns: [
      { regex: /\b(\d{8,12})\b/g, requiresSender: true, requiresContext: true, confidence: 'medium' },
    ],
  },
  {
    carrier: 'Alliance Laundry',
    slug: 'other',
    senderPatterns: [/alliancelaundry\.com/i],
    patterns: [
      { regex: /\b([A-Z0-9-]{8,20})\b/gi, requiresSender: true, requiresContext: true, confidence: 'medium' },
    ],
  },
];

function normalizeTrackingNumber(value: string) {
  return value.replace(/\s+/g, '').trim().toUpperCase();
}

function senderMatches(from: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(from));
}

function hasTrackingContext(text: string, index: number, length: number) {
  const start = Math.max(0, index - 120);
  const end = Math.min(text.length, index + length + 120);
  const window = text.slice(start, end);
  return CONTEXT_KEYWORD.test(window);
}

function isPhoneNumber(value: string, context: string) {
  if (PHONE_PATTERN.test(value)) return true;
  if (/^\d{10}$/.test(value) && PHONE_PATTERN.test(context)) return true;
  return false;
}

function isLikelyGarbage(value: string) {
  if (!value || value.length < 8) return true;
  if (/^0+$/.test(value)) return true;
  if (/^(\d)\1+$/.test(value)) return true;
  if (/^(19|20)\d{2}$/.test(value)) return true;
  return false;
}

function collectMatches(
  text: string,
  from: string,
  rule: CarrierRule,
): ExtractedTracking[] {
  const results: ExtractedTracking[] = [];
  const senderOk = senderMatches(from, rule.senderPatterns);

  for (const pattern of rule.patterns) {
    if (pattern.requiresSender && !senderOk) continue;

    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[1] || match[0];
      const trackingNumber = normalizeTrackingNumber(raw);
      if (isLikelyGarbage(trackingNumber)) continue;
      if (isPhoneNumber(trackingNumber, text)) continue;
      if (pattern.requiresContext && !hasTrackingContext(text, match.index, raw.length)) continue;

      results.push({
        tracking_number: trackingNumber,
        carrier: rule.carrier,
        slug: rule.slug,
        confidence: pattern.confidence,
        reason: `${rule.carrier} match${senderOk ? ' from sender' : ''}${pattern.requiresContext ? ' with context' : ''}`,
      });
    }
  }

  return results;
}

export function extractTrackingCandidates(email: {
  from: string;
  subject: string;
  body: string;
}): ExtractedTracking[] {
  const text = `${email.subject}\n${email.body}`;
  const deduped = new Map<string, ExtractedTracking>();

  for (const rule of CARRIER_RULES) {
    for (const candidate of collectMatches(text, email.from, rule)) {
      const existing = deduped.get(candidate.tracking_number);
      if (!existing || (existing.confidence === 'medium' && candidate.confidence === 'high')) {
        deduped.set(candidate.tracking_number, candidate);
      }
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const rank = { high: 0, medium: 1 };
    return rank[a.confidence] - rank[b.confidence];
  });
}

export function extractBestTracking(email: {
  from: string;
  subject: string;
  body: string;
}): ExtractedTracking | null {
  const candidates = extractTrackingCandidates(email);
  return candidates.find(candidate => candidate.confidence === 'high') || candidates[0] || null;
}
