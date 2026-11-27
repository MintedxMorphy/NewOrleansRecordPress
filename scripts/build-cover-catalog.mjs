#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'data', 'cover-catalog.json');
const cachePath = path.join(repoRoot, '.data', 'cover-catalog-cache.json');

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';
const DEFAULT_BASE_ID = 'appu3BWQLTIxzKF3V';
const DEFAULT_TABLE = 'Completed';
const FIELDS = ['Job Name', 'MATRIX', 'Quantity', 'Colors', 'DATE ORDERED'];
const COLOR_HEX = {
  black: '#161616',
  blue: '#2779a7',
  green: '#258064',
  red: '#c74242',
  orange: '#ef9f27',
  yellow: '#f1c94b',
  purple: '#7350a5',
  pink: '#d46794',
  gold: '#caa24d',
  silver: '#9ca3af',
  white: '#f3f0e8',
  clear: '#d7ecf5',
};

const SEED_RELEASES = [
  ['Black Flag', 'Jealous Again', 'SST-003', 1200, ['black'], 'SST Records', '', 95],
  ['Minute Men', '3-Way Tie', 'SST-058', 1000, ['green'], 'SST Records', '', 91],
  ['Husker Du', 'Flip Your Wig', 'SST-055', 800, ['blue'], 'SST Records', '', 90],
  ['Preservation Hall Jazz Band', 'So It Is', 'NMR 0501', 1500, ['black'], 'New Modern Records', '', 88],
  ['Low Cut Connie', 'Art Dealers', 'LCC-CON-110-1', 1000, ['black'], 'Contender', '', 84],
  ['Kamaiyah', 'Tresie', 'KEEPITLIT-01', 400, ['black'], 'Keep It Lit', '', 80],
  ['Lost Bayou Ramblers', 'Live at the Orpheum', 'LBR-001', 500, ['black'], 'Independent', '', 79],
  ['Amanda Shaw', 'Not A Bubble Gum Pop Princess', 'AS-2024', 500, ['pink'], 'Independent', '', 77],
  ['Anders Osborne', "Picasso's Villa", 'AO-001', 500, ['black'], 'Independent', '', 76],
  ['Arise Roots', 'Pathways', 'AR-001', 500, ['green'], 'Ineffable Records', '', 75],
  ['Sir Woman', 'Bitch', 'NMR 0501', 500, ['gold', 'silver', 'black'], 'New Modern Records', '', 74],
  ['Ike Yard', '1982', 'DE-295', 1000, ['black'], 'Dark Entries', '', 73],
  ['Euroshima', 'Gala', 'DE-292', 1000, ['black'], 'Dark Entries', '', 72],
  ['Alex Molo', 'Look At Me', 'DE-294', 1000, ['yellow'], 'Dark Entries', '', 71],
  ['Maggie Koerner', 'Upstate', 'MK-005', 1000, ['black'], 'Independent', '', 70],
  ['Stooges Brass Band', 'Street Music', 'SCR-002', 500, ['black'], 'Sinking City Records', 'https://i.discogs.com/ndh_BhRTq-Nus5wh2GnTsXWzA40KXStRjLUW5JbDi50/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTQ3NTE3/MTMtMTM4ODI1NDg3/MS00MDczLmpwZWc.jpeg', 69],
  ['Seprock', 'Beat Tape Sides A & B', 'SCR-006', 600, ['black'], 'Sinking City Records', 'https://i.discogs.com/MbTcTe_sl8hvP113L7H6NnM_frmbes_u1PoS93yQ7s4/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTExNzIz/NzM1LTE1MjEyOTk0/NzctOTczNS5qcGVn.jpeg', 68],
  ['Deacon John', "Deacon John's Jump Blues", 'VCC-1005', 500, ['black'], 'Vetter Communications', '', 67],
  ['Jenny Scheinman', 'New Release', 'JS-001', 500, ['black'], 'Independent', '', 66],
  ['Not Exotic', 'Self-Titled Debut', 'NE-001', 300, ['black'], 'Independent', '', 65],
  ['Whisper Party!', 'Waveland', 'WP-001', 300, ['blue'], 'Independent', '', 64],
  ['Troy Sawyer and The Elementz', 'Rock Your Soul', 'TS-001', 300, ['black'], 'Independent', '', 63],
  ['Horseshoes & Hand Grenades', "For Old Time's Sake", 'HHGFOTS420', 300, ['black'], 'Independent', '', 62],
  ['Da Buze Bruvaz x Lord Beatjitzu', 'Bolo Yeung Barbarian Bicepz', 'GP-39', 80, ['yellow', 'red'], 'Grilchy Party', '', 61],
  ['HIM LO x Shar the Analog Bastard', 'The Grand Architect', 'GP-53', 150, ['black'], 'Grilchy Party', '', 60],
  ['Clever 1 & Giallo Point', 'Gunz, Knives + Nunchuckz', 'GP-45', 150, ['black'], 'Grilchy Party', '', 59],
  ['Controller 7', 'Nobody Planning to Leave Instrumentals', 'GCR026', 250, ['black'], 'Giallo Point', '', 58],
  ['The Dad Horse Experience', 'The Dad Horse Experience', 'CSR-022', 250, ['orange'], 'Cursed Sound', '', 57],
  ['lowercase', 'Asides and Besides', 'REP-009', 350, ['black'], 'Independent', '', 56],
  ['Slowhole', 'Slowhole', 'ORE014', 700, ['black'], 'Independent', '', 55],
  ['MIMA', 'El Pozo', 'DDLP 002', 1000, ['black'], 'Independent', '', 54],
  ['Dynasty Handbag', 'The Bored Identity', 'WW-011', 500, ['pink'], 'Independent', '', 53],
  ['sunrise:sunset', 'sunrise:sunset', 'sunrise001', 100, ['purple', 'gold'], 'Independent', '', 52],
  ['haves', 'point', 'pop156', 125, ['black'], 'Independent', '', 51],
  ['Silent EM', 'Silent EM', 'DKA0024', 50, ['green', 'silver'], 'DKA', '', 50],
  ['Ricky B', 'Shake It Fo Ya Hood', 'SCR-013', 300, ['black'], 'Sinking City Records', 'https://i.discogs.com/Ykl4-kd89XZqxPJCKQYnFd6xtVbXWy9RLS-i8N142u0/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE1MTI0/MTEwLTE1ODY5ODE3/MzEtNzU5NC5qcGVn.jpeg', 49],
  ['Blackbird & Seprock', 'Lifetime / Hustler', 'SCR-014', 300, ['black'], 'Sinking City Records', 'https://i.discogs.com/74luF6WO269SnVopt9dG1OkXDJZ8P1-pLSh4uEzNVdU/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE1MTI0/MTMxLTE1ODY5ODE5/MjItMjk2MC5qcGVn.jpeg', 48],
  ['Charm Taylor', 'She Is The Future', 'SCR-023', 300, ['black'], 'Sinking City Records', '', 47],
  ['The Monocle', 'KindHumanKind', 'SCR-021', 300, ['black'], 'Sinking City Records', 'https://i.discogs.com/lWaDJVEaIjQ62oYDpVPWVyUV-UXDdmiqIYrh0O5Mm6o/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTMyOTUy/MDA2LTE3Mzc4NDA1/NjEtOTUxNS5qcGVn.jpeg', 46],
  ['Tasche De La Rocha & The Psychedelic Roses', 'Self-Titled', 'TASCHE-LP', 300, ['red'], 'Independent', 'https://i.discogs.com/GkPXjmlnQvJ0BFwEBbztVOjdMGhei7d1qK27zNwNN_o/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTI5NzAw/NTM1LTE3MDcwOTk1/ODAtMzYyMS5qcGVn.jpeg', 45],
  ['BASHER', 'Doubles', 'SCR-024', 500, ['black'], 'Sinking City Records', 'https://i.discogs.com/nWFGR-FVaIzQ-3FvTapdNeFF-7_9M7sL3SM0ZUdjFpY/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTI2MDc4/NDE5LTE2NzYyMTk1/MzUtNjk4MS5qcGVn.jpeg', 44],
  ['_thesmoothcat & Wino Willy', 'Ready, Set', 'SCR-029', 500, ['black'], 'Sinking City Records', 'https://i.discogs.com/MTdI3-Ql4Vq3KVmPYFoBZ_SmSAhESDpYYn0tC9i-lZc/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTMwMTgw/OTc0LTE3MzA3MTQ4/ODEtNTcxMi5qcGVn.jpeg', 43],
];

function loadDotEnv() {
  for (const name of ['.env.local', '.env', '.env.production']) {
    const filePath = path.join(repoRoot, name);
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stringifyCell(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(stringifyCell).filter(Boolean).join(', ');
  if (typeof value === 'object') return value.name || value.id || '';
  return String(value);
}

function parseNumber(value) {
  const parsed = Number(stringifyCell(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseColors(value) {
  const raw = Array.isArray(value) ? value.map(stringifyCell) : stringifyCell(value).split(',');
  return raw.map(color => color.trim()).filter(Boolean).slice(0, 3);
}

function accentColor(colors) {
  const text = colors.join(' ').toLowerCase();
  for (const [name, hex] of Object.entries(COLOR_HEX)) {
    if (text.includes(name)) return hex;
  }
  return '#2779a7';
}

function cleanJobName(value) {
  let text = stringifyCell(value)
    .replace(/\*\*.*?\*\*/g, ' ')
    .replace(/\([^)]*(?:variant|overs?|due|show|jacket|sleeve|border|cut|white|black)[^)]*\)/gi, ' ')
    .replace(/\b(?:no\s+overs?|overs?|due|need(?:s|ed)?|wants?|pressed|repress|new\s+cut|one\s+sided|different\s+inner\s+sleeves).*$/i, ' ')
    .replace(/\b\d+\s*(?:sets?|copies|pcs|records?|lps?|lp)\b/gi, ' ')
    .replace(/\b(?:august|summer|nov|oct|july|release\s+show)\b.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  text = text.replace(/\s+-\s+$/, '').trim();
  return text;
}

function parseRelease(fields) {
  const name = cleanJobName(fields['Job Name']);
  if (!name || name.length < 3) return null;

  const parts = name.split(/\s+-\s+/).map(part => part.trim()).filter(Boolean);
  const artist = parts.length > 1 ? parts.shift() : name;
  const title = parts.length > 0 ? parts.join(' - ') : name;
  const cleanArtist = artist.replace(/\s+/g, ' ').trim();
  const cleanTitle = title.replace(/\s+/g, ' ').trim();
  if (!cleanArtist || cleanArtist.length < 2) return null;

  return {
    artist: cleanArtist,
    title: cleanTitle || cleanArtist,
    matrix: stringifyCell(fields.MATRIX),
    quantity: parseNumber(fields.Quantity),
    colors: parseColors(fields.Colors),
  };
}

function matrixPrefix(matrix) {
  const match = String(matrix || '').toUpperCase().match(/^[A-Z]+/);
  return match ? match[0] : '';
}

function labelFromMatrix(matrix) {
  const prefix = matrixPrefix(matrix);
  if (prefix === 'SST') return 'SST Records';
  if (prefix === 'SCR') return 'Sinking City Records';
  if (prefix === 'DE') return 'Dark Entries';
  if (prefix === 'GP') return 'Grilchy Party';
  if (prefix === 'NMR') return 'New Modern Records';
  return '';
}

function knownBoost(release) {
  const key = `${release.artist} ${release.title} ${release.label || ''}`.toLowerCase();
  const boosts = [
    ['black flag', 28],
    ['minutemen', 26],
    ['minute men', 26],
    ['husker du', 25],
    ['sst records', 20],
    ['preservation hall', 20],
    ['pres hall', 20],
    ['low cut connie', 18],
    ['kamaiyah', 16],
    ['lost bayou ramblers', 16],
    ['anders osborne', 15],
    ['amanda shaw', 14],
    ['dark entries', 12],
    ['sinking city', 10],
  ];
  return boosts.reduce((score, [needle, amount]) => (key.includes(needle) ? Math.max(score, amount) : score), 0);
}

function loadCache() {
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  mkdirSync(path.dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}: ${detail.slice(0, 220)}`);
  }
  return response.json();
}

async function listAirtableRecords() {
  const token = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
  if (!token) throw new Error('Missing AIRTABLE_PAT, AIRTABLE_TOKEN, or AIRTABLE_API_KEY. Use --seed for the visual comp dataset.');

  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const table = process.env.AIRTABLE_COMPLETED_TABLE || DEFAULT_TABLE;
  const records = [];
  let offset = '';

  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (offset) params.set('offset', offset);
    for (const field of FIELDS) params.append('fields[]', field);
    const url = `${AIRTABLE_API_URL}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`;
    const payload = await fetchJson(url, { Authorization: `Bearer ${token}` });
    records.push(...(payload.records || []));
    offset = payload.offset || '';
  } while (offset);

  return records.map(record => ({ id: record.id, fields: record.fields || {} }));
}

async function lookupDiscogs(release, cache) {
  const token = process.env.DISCOGS_TOKEN;
  const key = `discogs:${slug(release.artist)}:${slug(release.title)}`;
  if (cache[key]?.coverUrl) return cache[key];

  const headers = { 'User-Agent': 'NewOrleansRecordPressCoverWall/1.0' };
  if (token) headers.Authorization = `Discogs token=${token}`;
  const params = new URLSearchParams({
    q: `${release.artist} ${release.title}`,
    type: 'release',
    per_page: '5',
  });
  const payload = await fetchJson(`https://api.discogs.com/database/search?${params}`, headers);
  const results = payload.results || [];
  const best = results
    .map(result => {
      const haystack = `${result.title || ''} ${(result.label || []).join(' ')}`.toLowerCase();
      const artistHit = haystack.includes(release.artist.toLowerCase()) ? 8 : 0;
      const titleHit = haystack.includes(release.title.toLowerCase()) ? 8 : 0;
      const matrixHit = release.matrix && haystack.includes(String(release.matrix).toLowerCase()) ? 6 : 0;
      return { result, score: artistHit + titleHit + matrixHit };
    })
    .sort((a, b) => b.score - a.score)[0];

  const coverUrl = best?.result?.cover_image || best?.result?.thumb || '';
  const match = best && best.score >= 8 && coverUrl
    ? {
        coverUrl,
        sourceUrl: best.result.uri ? `https://www.discogs.com${best.result.uri}` : '',
        label: Array.isArray(best.result.label) ? best.result.label[0] : '',
        year: best.result.year || '',
        confidence: best.score,
        provider: 'discogs',
      }
    : null;

  cache[key] = match;
  saveCache(cache);
  await new Promise(resolve => setTimeout(resolve, token ? 1200 : 2600));
  return match;
}

async function lookupItunes(release, cache) {
  const key = `itunes:${slug(release.artist)}:${slug(release.title)}`;
  if (cache[key]) return cache[key];
  const params = new URLSearchParams({
    term: `${release.artist} ${release.title}`,
    media: 'music',
    entity: 'album',
    limit: '5',
  });
  const payload = await fetchJson(`https://itunes.apple.com/search?${params}`);
  const best = (payload.results || [])[0];
  const match = best
    ? {
        coverUrl: String(best.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        sourceUrl: best.collectionViewUrl || '',
        label: best.artistName || '',
        year: best.releaseDate ? best.releaseDate.slice(0, 4) : '',
        confidence: 8,
        provider: 'itunes',
      }
    : null;
  cache[key] = match;
  saveCache(cache);
  return match;
}

async function enrichArtwork(releases, { skipArtwork }) {
  if (skipArtwork) return releases;
  const cache = loadCache();
  const sorted = [...releases].sort((a, b) => b.score - a.score);
  for (const release of sorted) {
    if (release.coverUrl) continue;
    try {
      const match = await lookupDiscogs(release, cache).catch(() => null) || await lookupItunes(release, cache).catch(() => null);
      if (!match) continue;
      release.coverUrl = match.coverUrl;
      release.sourceUrl = match.sourceUrl;
      release.label = match.label || release.label;
      release.year = match.year || release.year;
      release.artworkProvider = match.provider;
      release.artworkConfidence = match.confidence;
    } catch (error) {
      console.warn(`Artwork lookup failed for ${release.artist} - ${release.title}: ${error.message}`);
    }
  }
  return releases;
}

function scoreAndArrange(parsedReleases) {
  const byKey = new Map();
  for (const release of parsedReleases) {
    const key = `${slug(release.artist)}:${slug(release.title)}`;
    const existing = byKey.get(key);
    if (!existing || release.quantity > existing.quantity) {
      byKey.set(key, { ...release, count: (existing?.count || 0) + 1 });
    } else {
      existing.count += 1;
      existing.quantity += release.quantity;
    }
  }

  const releases = [...byKey.values()];
  const artistCounts = releases.reduce((counts, release) => {
    const key = slug(release.artist);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const prefixCounts = releases.reduce((counts, release) => {
    const prefix = matrixPrefix(release.matrix);
    if (prefix) counts[prefix] = (counts[prefix] || 0) + 1;
    return counts;
  }, {});

  releases.forEach(release => {
    release.label = release.label || labelFromMatrix(release.matrix);
    const quantityScore = Math.min(34, Math.log10(Math.max(1, release.quantity)) * 11);
    const repeatScore = Math.min(18, (artistCounts[slug(release.artist)] || 1) * 4);
    const labelScore = Math.min(16, (prefixCounts[matrixPrefix(release.matrix)] || 0) * 1.5);
    release.score = Math.round(quantityScore + repeatScore + labelScore + knownBoost(release));
    release.accent = accentColor(release.colors);
  });

  return releases
    .sort((a, b) => b.score - a.score)
    .map((release, index) => ({
      id: `${slug(release.artist)}-${slug(release.title) || index}`,
      artist: release.artist,
      title: release.title,
      matrix: release.matrix,
      quantity: release.quantity,
      colors: release.colors,
      label: release.label,
      year: release.year || '',
      coverUrl: release.coverUrl || '',
      sourceUrl: release.sourceUrl || '',
      score: release.score,
      accent: release.accent,
      tile: index < 8 ? 'hero' : index < 22 ? 'feature' : 'standard',
    }));
}

function buildSeedCatalog() {
  return SEED_RELEASES.map(([artist, title, matrix, quantity, colors, label, coverUrl, score], index) => ({
    id: `${slug(artist)}-${slug(title) || index}`,
    artist,
    title,
    matrix,
    quantity,
    colors,
    label,
    year: '',
    coverUrl,
    sourceUrl: '',
    score,
    accent: accentColor(colors),
    tile: index < 8 ? 'hero' : index < 22 ? 'feature' : 'standard',
  }));
}

async function main() {
  loadDotEnv();
  const args = new Set(process.argv.slice(2));
  const useSeed = args.has('--seed');
  const skipArtwork = args.has('--skip-artwork');
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

  const records = useSeed ? [] : await listAirtableRecords();
  const releases = useSeed
    ? buildSeedCatalog()
    : scoreAndArrange(records.map(record => parseRelease(record.fields)).filter(Boolean));
  const limited = limit > 0 ? releases.slice(0, limit) : releases;
  const enriched = await enrichArtwork(limited, { skipArtwork });

  const catalog = {
    generatedAt: new Date().toISOString(),
    source: useSeed ? 'seed-preview' : 'airtable-completed',
    stats: {
      totalJobs: useSeed ? SEED_RELEASES.length : records.length,
      uniqueReleases: enriched.length,
      withArtwork: enriched.filter(release => Boolean(release.coverUrl)).length,
      artworkPending: enriched.filter(release => !release.coverUrl).length,
    },
    releases: enriched,
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Wrote ${enriched.length} releases to ${path.relative(repoRoot, outputPath)}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
