import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableTableMeta = {
  id: string;
  name: string;
};

const MARKET_SYMBOLS = [
  { symbol: 'WLK', label: 'Westlake', group: 'PVC supply proxy' },
  { symbol: 'OLN', label: 'Olin', group: 'chemical supply proxy' },
  { symbol: 'CL=F', label: 'Crude oil', group: 'feedstock pressure' },
  { symbol: 'NG=F', label: 'Natural gas', group: 'energy input' },
  { symbol: 'HG=F', label: 'Copper', group: 'metal/electrical proxy' },
  { symbol: 'MBR1=F', label: 'MBR1', group: 'legacy compound watch' },
];

function airtableToken() {
  return process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT;
}

function airtableBaseId() {
  return process.env.AIRTABLE_BASE_ID;
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function field(fields: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const matchingKey = Object.keys(fields).find(key => key.toLowerCase() === alias.toLowerCase());
    const value = matchingKey ? fields[matchingKey] : undefined;
    if (value !== null && value !== undefined && value !== '') return stringValue(value);
  }
  return '';
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pctChange(current: number | null, previous: number | null) {
  if (!current || !previous) return null;
  return ((current - previous) / previous) * 100;
}

async function fetchYahooSignal(symbol: string) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta || {};
    const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : null;
    const previousClose = typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : null;

    return {
      symbol,
      price,
      previousClose,
      changePct: pctChange(price, previousClose),
      currency: meta.currency || '',
      exchange: meta.exchangeName || '',
      asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : '',
      error: '',
    };
  } catch (error) {
    return {
      symbol,
      price: null,
      previousClose: null,
      changePct: null,
      currency: '',
      exchange: '',
      asOf: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function airtableTables() {
  const token = airtableToken();
  const baseId = airtableBaseId();
  if (!token || !baseId) return [];

  const res = await fetch(`${AIRTABLE_API_URL}/meta/bases/${encodeURIComponent(baseId)}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.tables || []) as AirtableTableMeta[];
}

function resolveTable(tables: AirtableTableMeta[], names: string[]) {
  const byExact = tables.find(table => names.some(name => table.name.toLowerCase() === name.toLowerCase()));
  if (byExact) return byExact;

  const normalizedNames = names.map(normalized);
  return tables.find(table => {
    const tableName = normalized(table.name);
    return normalizedNames.some(name => tableName.includes(name) || name.includes(tableName));
  });
}

async function airtableRecords(table: AirtableTableMeta | undefined) {
  const token = airtableToken();
  const baseId = airtableBaseId();
  if (!token || !baseId || !table) return [];

  const records: AirtableRecord[] = [];
  let offset = '';
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (offset) params.set('offset', offset);
    const res = await fetch(`${AIRTABLE_API_URL}/${encodeURIComponent(baseId)}/${encodeURIComponent(table.id)}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) break;
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || '';
  } while (offset);

  return records;
}

function mapSupplier(record: AirtableRecord) {
  const fields = record.fields;
  return {
    id: record.id,
    supplier: field(fields, ['Supplier', 'Vendor', 'Company', 'Name']),
    material: field(fields, ['Material', 'Product', 'Compound', 'Item']),
    price: field(fields, ['Price/lb', 'Price Per Lb', 'Price', 'Quote', 'Unit Cost']),
    leadTime: field(fields, ['Lead Time', 'Turnaround', 'Availability']),
    minimum: field(fields, ['Minimum Order', 'MOQ', 'Minimum']),
    freight: field(fields, ['Freight', 'Shipping', 'Freight Estimate']),
    quoteDate: field(fields, ['Quote Date', 'Date', 'Updated', 'Last Updated']),
    contact: field(fields, ['Contact', 'Rep', 'Email', 'Phone']),
    notes: field(fields, ['Notes', 'Terms', 'Details']),
  };
}

function mapCompetitor(record: AirtableRecord) {
  const fields = record.fields;
  return {
    id: record.id,
    plant: field(fields, ['Plant', 'Pressing Plant', 'Competitor', 'Company', 'Name']),
    format: field(fields, ['Format', 'Product', 'Record Type']),
    quantity: field(fields, ['Quantity', 'Qty', 'Run Size']),
    price: field(fields, ['Price/Unit', 'Unit Price', 'Price', 'Quote']),
    turnaround: field(fields, ['Turnaround', 'Lead Time']),
    package: field(fields, ['Package', 'Packaging', 'Includes']),
    source: field(fields, ['Source', 'URL', 'Link']),
    updated: field(fields, ['Updated', 'Last Updated', 'Date']),
    notes: field(fields, ['Notes', 'Details']),
  };
}

async function fetchFederalRegister() {
  try {
    const params = new URLSearchParams({
      'conditions[term]': 'PVC plastics tariff vinyl records',
      per_page: '6',
      order: 'newest',
    });
    const res = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    const data = await res.json();
    return (data.results || []).map((item: any) => ({
      title: item.title || '',
      source: 'Federal Register',
      date: item.publication_date || '',
      url: item.html_url || item.pdf_url || '',
      category: 'Regulatory',
    }));
  } catch {
    return [];
  }
}

async function fetchGdelt(query: string, category: string) {
  try {
    const params = new URLSearchParams({
      query,
      mode: 'artlist',
      format: 'json',
      maxrecords: '8',
      sort: 'hybridrel',
    });
    const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    const data = await res.json();
    return (data.articles || []).map((item: any) => ({
      title: item.title || '',
      source: item.domain || item.sourceCountry || 'GDELT',
      date: item.seendate || '',
      url: item.url || '',
      category,
    }));
  } catch {
    return [];
  }
}

function makeActions(input: {
  signals: Array<{ symbol: string; label: string; changePct: number | null; error?: string }>;
  supplierQuotes: unknown[];
  competitorPricing: unknown[];
  headlines: unknown[];
  federalNotices: unknown[];
}) {
  const actions = [];
  const crude = input.signals.find(signal => signal.symbol === 'CL=F');
  const gas = input.signals.find(signal => signal.symbol === 'NG=F');

  if (!input.supplierQuotes.length) {
    actions.push({
      level: 'high',
      title: 'Populate Supplier Intel',
      detail: 'Add current PVC compound quotes, freight, minimums, and lead times. Public market proxies are useful, but supplier quotes are the operating truth.',
    });
  }

  if (!input.competitorPricing.length) {
    actions.push({
      level: 'medium',
      title: 'Populate Competitor Pricing',
      detail: 'Track pressing plant quote sheets by quantity, format, color premium, packaging, and turnaround so NORP can price from evidence.',
    });
  }

  if ((crude?.changePct || 0) > 2 || (gas?.changePct || 0) > 2) {
    actions.push({
      level: 'medium',
      title: 'Check Compound Exposure',
      detail: 'Energy inputs are moving up. Ask suppliers whether today quote validity or freight assumptions changed.',
    });
  }

  if (input.federalNotices.length) {
    actions.push({
      level: 'medium',
      title: 'Review Trade Notices',
      detail: 'Fresh Federal Register results matched PVC/plastics/tariff terms. Confirm whether anything affects compound, jackets, nickel, or imported finished records.',
    });
  }

  if (!input.headlines.length) {
    actions.push({
      level: 'low',
      title: 'Headline Feed Needs Review',
      detail: 'No industry headlines returned from the free feed. Check source availability before relying on automated market watch.',
    });
  }

  return actions.slice(0, 6);
}

export async function GET() {
  const generatedAt = new Date().toISOString();
  const signals = await Promise.all(MARKET_SYMBOLS.map(async config => ({
    ...config,
    ...(await fetchYahooSignal(config.symbol)),
  })));

  const tables = await airtableTables().catch(() => []);
  const supplierTable = resolveTable(tables, ['Supplier Intel', 'Supplier Quotes', 'Market Supplier Intel']);
  const competitorTable = resolveTable(tables, ['Competitor Pricing', 'Pressing Competitor Pricing', 'Plant Pricing']);
  const [supplierRecords, competitorRecords, federalNotices, vinylNews, pvcNews] = await Promise.all([
    airtableRecords(supplierTable),
    airtableRecords(competitorTable),
    fetchFederalRegister(),
    fetchGdelt('(vinyl record pressing OR record pressing plant OR vinyl records) sourceCountry:US', 'Industry'),
    fetchGdelt('(PVC resin OR PVC compound OR polyvinyl chloride) tariff OR price OR supply', 'Materials'),
  ]);

  const supplierQuotes = supplierRecords.map(mapSupplier).filter(row => row.supplier || row.material || row.price);
  const competitorPricing = competitorRecords.map(mapCompetitor).filter(row => row.plant || row.price || row.format);
  const headlines = [...vinylNews, ...pvcNews]
    .filter(item => item.title && item.url)
    .slice(0, 12);
  const actions = makeActions({ signals, supplierQuotes, competitorPricing, headlines, federalNotices });

  return NextResponse.json({
    generatedAt,
    sources: {
      signals: 'Yahoo Finance public chart endpoint',
      supplierQuotes: supplierTable ? `Airtable: ${supplierTable.name}` : 'Airtable table not found',
      competitorPricing: competitorTable ? `Airtable: ${competitorTable.name}` : 'Airtable table not found',
      headlines: 'GDELT public news search',
      federalNotices: 'Federal Register public API',
    },
    signals,
    supplierQuotes,
    competitorPricing,
    headlines,
    federalNotices,
    actions,
  });
}
