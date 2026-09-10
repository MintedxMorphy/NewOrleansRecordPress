import manual from './pages.json';
import { isRecordSizeChangeQuery, playbookForQuestion, sizeChangePreferredPages } from './playbooks';

export type ManualPage = {
  page: number;
  heading: string;
  text: string;
};

export type RetrievedPage = ManualPage & {
  score: number;
  snippet: string;
};

export type ManualMeta = {
  docId: string;
  revision: string;
  title: string;
  publisher: string;
  year: number;
  pageCount: number;
};

type ManualDoc = ManualMeta & { pages: ManualPage[] };

const DOC = manual as ManualDoc;

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'it', 'if',
  'how', 'do', 'does', 'did', 'what', 'when', 'why', 'with', 'from', 'this', 'that',
  'be', 'are', 'was', 'were', 'can', 'could', 'should', 'would', 'i', 'we', 'you',
  'my', 'our', 'me', 'not', 'no', 'yes', 'please', 'help', 'about', 'into', 'at',
  'by', 'as', 'so', 'than', 'then', 'too', 'very', 'just', 'get', 'got', 'make',
  'need', 'needs', 'change', 'changing', 'want', 'have', 'has',
]);

const SIZE_CHANGE_PAGES = new Set(sizeChangePreferredPages());

const PAGE_TITLES: Record<number, string> = {
  28: 'Moulds and Stampers',
  29: 'Moulds by record size (12-inch / 7-inch)',
  34: 'Stacking Spindles',
  61: 'Job Details',
  62: 'Job Details — compound and record counts',
  63: 'Load Job / saved process settings',
  68: 'Process Details',
  69: 'Heat, dwell, cool, and pressure timings',
  70: 'Press At Pressure Details',
  94: 'Loading Labels and Label Cartridges',
  95: 'Removing label cartridges',
  99: 'Changing Spindles',
  100: 'Removing and replacing spindles',
  101: 'Installing and Removing Stampers',
  104: 'Before Removing Moulds',
  105: 'Removing Moulds',
  106: 'Installing Moulds',
  107: 'Installing Moulds (top mould / jig)',
  108: 'Installing Moulds (clamps and hoses)',
  109: 'Mould install leak check',
};

export function getManualMeta(): ManualMeta {
  const { pages: _pages, ...meta } = DOC;
  return meta;
}

export function getPlantCard() {
  return [
    'This assistant is for New Orleans Record Press (NORP) employees only.',
    'Machine: Viryl WarmTone MK1, serial PRS00007, CEC Controls VT-PRS-001 (2017).',
    'Integrated auto edge trimmer and dual stacking.',
    'Hydraulics: Ersteel hydraulic power unit.',
    'Steam: Bryan CLM300-S-150-GI boiler feeding platens (Fulton backup is down).',
    'Plant: 1336 Montegut Street, New Orleans, LA 70117.',
    'Do not give Finebilt-only procedures unless the operator clearly asks about the Finebilt.',
  ].join(' ');
}

export function pageTitle(page: { page: number; heading?: string }): string {
  if (PAGE_TITLES[page.page]) return PAGE_TITLES[page.page];
  const heading = (page.heading || '').replace(/\s+/g, ' ').trim();
  if (!heading) return `Manual page ${page.page}`;
  return heading.length > 72 ? `${heading.slice(0, 69)}…` : heading;
}

const SYNONYMS: Record<string, string[]> = {
  platen: ['mold', 'steam', 'heat', 'heating'],
  platens: ['mold', 'steam', 'heat', 'heating'],
  steam: ['boiler', 'heat', 'heating', 'mold', 'valve'],
  heating: ['steam', 'mold', 'heat', 'valve'],
  hmi: ['screen', 'display', 'touch'],
  jam: ['fault', 'alarm', 'stuck'],
  jammed: ['fault', 'alarm', 'stuck'],
  alarm: ['fault'],
  hydraulics: ['hydraulic', 'hpu', 'oil'],
  hydraulic: ['hydraulics', 'hpu', 'oil'],
  trimmer: ['trimming', 'edge'],
  stamper: ['stampers', 'mold'],
  stampers: ['stamper', 'mold'],
  mold: ['molds', 'stamper'],
  molds: ['mold', 'stamper'],
  spindle: ['spindles', 'stacking'],
  spindles: ['spindle', 'stacking'],
  recipe: ['job', 'process'],
  recipes: ['job', 'process'],
  dwell: ['heat', 'cool', 'timing'],
  label: ['labels', 'cartridge'],
  labels: ['label', 'cartridge'],
};

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/moulds/g, 'molds')
    .replace(/mould/g, 'mold')
    .replace(/12\s*[-]?\s*(?:inch|in\b|["”''])/g, ' 12inch ')
    .replace(/7\s*[-]?\s*(?:inch|in\b|["”''])/g, ' 7inch ')
    .replace(/10\s*[-]?\s*(?:inch|in\b|["”''])/g, ' 10inch ')
    .replace(/\b12\s+molds?\b/g, ' 12inch mold ')
    .replace(/\b7\s+molds?\b/g, ' 7inch mold ')
    .replace(/\blps?\b/g, ' lp 12inch ')
    .replace(/\beps?\b/g, ' ep 7inch ')
    .replace(/\bjob recipes?\b/g, ' load job process settings ')
    .replace(/\bload jobs?\b/g, ' load job ')
    .replace(/\bsize changes?\b/g, ' mold spindle job size ');
}

function tokenize(value: string): string[] {
  const normalized = normalizeForSearch(value);
  const base = normalized
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP.has(token) && !/^\d{1,2}$/.test(token));
  const extra: string[] = [];
  for (const token of base) {
    extra.push(...(SYNONYMS[token] || []));
  }
  return [...new Set([...base, ...extra])];
}

function faultCodes(value: string): string[] {
  const found = new Set<string>();
  for (const match of value.matchAll(/\b(\d{4})\b/g)) {
    found.add(match[1]);
  }
  return [...found];
}

function snippetFor(text: string, tokens: string[], faults: string[]): string {
  const haystack = text
    .replace(/CONFIDENTIAL\s*&\s*PROPRIETARY/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!haystack) return '';

  const needles = [...faults, ...tokens.filter((token) => token.length > 3)];
  let bestAt = 0;
  for (const needle of needles) {
    const match = haystack.match(new RegExp(`\\b${needle}\\b`, 'i'));
    if (match?.index != null) {
      bestAt = Math.max(0, match.index - 80);
      break;
    }
  }
  const slice = haystack.slice(bestAt, bestAt + 240).trim();
  return (bestAt > 0 ? '…' : '') + slice + (bestAt + 240 < haystack.length ? '…' : '');
}

function sizeChangeBoost(page: ManualPage): number {
  let boost = 0;
  if (SIZE_CHANGE_PAGES.has(page.page)) boost += 40;
  const heading = normalizeForSearch(page.heading);
  if (/installing molds|removing molds|before removing molds/.test(heading)) boost += 28;
  if (/changing spindles|removing spindles|replacing spindles/.test(heading)) boost += 26;
  if (/job details|load job|process details/.test(heading)) boost += 22;
  if (/molds and stampers|record size/.test(heading)) boost += 12;
  if (/loading labels/.test(heading)) boost += 10;
  if (/sequence settings/.test(heading) || page.page === 78) boost -= 36;
  if (/table of contents|spare parts|fault number/.test(heading) || page.page <= 8) boost -= 24;
  return boost;
}

function scorePage(
  page: ManualPage,
  tokens: string[],
  faults: string[],
  phrases: string[],
  sizeChange: boolean,
): number {
  const body = normalizeForSearch(`${page.heading}\n${page.text}`);
  if (!body.trim()) return 0;

  let score = 0;
  for (const fault of faults) {
    if (new RegExp(`\\b${fault}\\b`).test(body)) score += 48;
  }
  for (const phrase of phrases) {
    if (phrase.length > 5 && body.includes(phrase)) score += 18;
  }

  const heading = normalizeForSearch(page.heading);
  for (const token of tokens) {
    const tokenRe = new RegExp(`\\b${token}\\b`, 'g');
    const hits = Math.min((body.match(tokenRe) || []).length, 6);
    if (!hits) continue;
    score += hits * (token.length > 5 ? 2.4 : 1.6);
    if (heading.includes(token)) score += 10;
  }

  if (sizeChange) score += sizeChangeBoost(page);
  return score;
}

function bucketFor(page: number): 'mould' | 'spindle' | 'job' | 'label' | 'other' {
  if ([28, 29, 101, 104, 105, 106, 107, 108, 109].includes(page)) return 'mould';
  if ([34, 99, 100].includes(page)) return 'spindle';
  if ([61, 62, 63, 68, 69, 70].includes(page)) return 'job';
  if ([94, 95, 96, 97, 98].includes(page)) return 'label';
  return 'other';
}

export function retrieveManualPages(query: string, limit = 8): RetrievedPage[] {
  const tokens = tokenize(query);
  const faults = faultCodes(query);
  const sizeChange = isRecordSizeChangeQuery(query);
  const playbook = playbookForQuestion(query);
  if (tokens.length === 0 && faults.length === 0 && !sizeChange) return [];

  const phrases = normalizeForSearch(query)
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .reduce<string[]>((acc, _, i, parts) => {
      if (i < parts.length - 1) acc.push(`${parts[i]} ${parts[i + 1]}`);
      return acc;
    }, []);

  if (sizeChange) {
    phrases.push('record size', 'load job', 'process settings', 'changing spindles', 'installing molds', 'removing molds');
  }

  const ranked = DOC.pages
    .map((page) => ({
      ...page,
      score: scorePage(page, tokens, faults, phrases, sizeChange),
    }))
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score || a.page - b.page);

  if (playbook) {
    for (const pageNum of playbook.pages) {
      const existing = ranked.find((page) => page.page === pageNum);
      if (existing) {
        existing.score = Math.max(existing.score, 32);
        continue;
      }
      const page = DOC.pages.find((item) => item.page === pageNum);
      if (page) ranked.push({ ...page, score: 32 });
    }
    ranked.sort((a, b) => b.score - a.score || a.page - b.page);
  }

  const picked = new Map<number, (typeof ranked)[number]>();

  if (sizeChange) {
    for (const bucket of ['mould', 'spindle', 'job', 'label'] as const) {
      const hit = ranked.find((page) => bucketFor(page.page) === bucket && !picked.has(page.page));
      if (hit) {
        picked.set(hit.page, hit);
      }
    }
  }

  for (const page of ranked) {
    if (picked.size >= limit) break;
    if (picked.has(page.page)) continue;
    picked.set(page.page, page);
    const neighbor = DOC.pages[page.page]; // 0-index: page+1
    const neighborOk =
      neighbor &&
      !picked.has(neighbor.page) &&
      page.score >= 12 &&
      picked.size < limit &&
      (!sizeChange || SIZE_CHANGE_PAGES.has(neighbor.page) || bucketFor(neighbor.page) !== 'other');
    if (neighborOk && neighbor) {
      picked.set(neighbor.page, { ...neighbor, score: page.score * 0.35 });
    }
  }

  return [...picked.values()]
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, limit)
    .map((page) => ({
      ...page,
      heading: pageTitle(page),
      snippet: snippetFor(page.text, tokens, faults),
    }));
}

export function shouldSearchWeb(query: string, retrieved: RetrievedPage[]): boolean {
  const top = retrieved[0]?.score ?? 0;
  if (retrieved.length === 0 || top < 10) return true;
  return /\b(forum|reddit|other plants?|case study|known issue|anyone else|common problem|field report|workaround)\b/i.test(
    query,
  );
}

export function formatManualContext(pages: RetrievedPage[]): string {
  if (pages.length === 0) return '(No matching manual pages.)';
  return pages
    .map((page) => {
      const heading = page.heading ? ` — ${page.heading}` : '';
      const body = page.text.slice(0, 2800);
      return `--- Manual p. ${page.page}${heading} ---\n${body}`;
    })
    .join('\n\n');
}

export { isRecordSizeChangeQuery, playbookForQuestion };
