import manual from './pages.json';

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
]);

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

const SYNONYMS: Record<string, string[]> = {
  platen: ['mould', 'mold', 'steam', 'heat', 'heating'],
  platens: ['mould', 'mold', 'steam', 'heat', 'heating'],
  steam: ['boiler', 'heat', 'heating', 'mould', 'valve'],
  heating: ['steam', 'mould', 'heat', 'valve'],
  hmi: ['screen', 'display', 'touch'],
  jam: ['fault', 'alarm', 'stuck'],
  jammed: ['fault', 'alarm', 'stuck'],
  alarm: ['fault'],
  hydraulics: ['hydraulic', 'hpu', 'oil'],
  hydraulic: ['hydraulics', 'hpu', 'oil'],
  trimmer: ['trimming', 'edge'],
  stamper: ['stampers', 'mould'],
  stampers: ['stamper', 'mould'],
};

function tokenize(value: string): string[] {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
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
  const haystack = text.replace(/\s+/g, ' ').trim();
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

function scorePage(page: ManualPage, tokens: string[], faults: string[], phrases: string[]): number {
  const body = `${page.heading}\n${page.text}`.toLowerCase();
  if (!body.trim()) return 0;

  let score = 0;
  for (const fault of faults) {
    if (new RegExp(`\\b${fault}\\b`).test(body)) score += 48;
  }
  for (const phrase of phrases) {
    if (phrase.length > 5 && body.includes(phrase)) score += 18;
  }

  const heading = page.heading.toLowerCase();
  for (const token of tokens) {
    const tokenRe = new RegExp(`\\b${token}\\b`, 'g');
    const hits = Math.min((body.match(tokenRe) || []).length, 6);
    if (!hits) continue;
    score += hits * (token.length > 5 ? 2.4 : 1.6);
    if (heading.includes(token)) score += 10;
  }
  return score;
}

export function retrieveManualPages(query: string, limit = 8): RetrievedPage[] {
  const tokens = tokenize(query);
  const faults = faultCodes(query);
  if (tokens.length === 0 && faults.length === 0) return [];

  const phrases = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .reduce<string[]>((acc, _, i, parts) => {
      if (i < parts.length - 1) acc.push(`${parts[i]} ${parts[i + 1]}`);
      return acc;
    }, []);

  const ranked = DOC.pages
    .map((page) => ({
      ...page,
      score: scorePage(page, tokens, faults, phrases),
    }))
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score || a.page - b.page);

  const picked = new Map<number, (typeof ranked)[number]>();
  for (const page of ranked) {
    if (picked.size >= limit) break;
    picked.set(page.page, page);
    const neighbor = DOC.pages[page.page]; // 0-index: page+1
    if (neighbor && picked.size < limit && !picked.has(neighbor.page) && page.score >= 12) {
      picked.set(neighbor.page, { ...neighbor, score: page.score * 0.35 });
    }
  }

  return [...picked.values()]
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, limit)
    .map((page) => ({
      ...page,
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
