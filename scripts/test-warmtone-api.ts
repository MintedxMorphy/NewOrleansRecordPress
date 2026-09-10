import { NextRequest } from 'next/server';
import { POST, GET } from '../app/api/staff/warmtone-help/route.ts';

const QUESTION =
  'changing a 12" mold to a 7" mold and what settings need to change';

const RELEVANT_PAGES = [104, 105, 106, 99, 100, 61, 63, 68];

function internDump(answer: string) {
  return /not configured on this server|ANTHROPIC_API_KEY|OPENAI_API_KEY|stack|Traceback|ECONNREFUSED/i.test(
    answer,
  );
}

async function main() {
  const getRes = await GET();
  const getJson = await getRes.json();
  console.log('GET', {
    configured: getJson.configured,
    runtime: getJson.runtime,
    writer: getJson.writer,
    providers: getJson.providers,
    openaiModel: getJson.openaiModel,
    hasAnthropic: Boolean(process.env['ANTHROPIC_API_KEY']),
    hasOpenAi: Boolean(process.env['OPENAI_API_KEY'] || process.env['SHIPMENT_TRACKING_OPENAI_API_KEY']),
  });

  if (!getJson.configured) {
    if (getJson.providers?.openai || getJson.providers?.anthropic) {
      throw new Error('configured:false while a provider is present');
    }
  } else if (!getJson.providers?.openai && !getJson.providers?.anthropic) {
    throw new Error('configured:true needs openai or anthropic');
  }

  const req = new NextRequest('http://localhost/api/staff/warmtone-help', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: QUESTION }],
    }),
  });

  const res = await POST(req);
  const json = await res.json();
  console.log('fallback', json.fallback);
  console.log('model', json.model);
  console.log('provider', json.provider);
  if (json.error) console.log('error', json.error);
  console.log('answer:\n' + json.answer);
  console.log(
    'citations:',
    (json.citations || []).map((c: { page: number; heading: string }) => `p.${c.page} ${c.heading}`).join(' | '),
  );

  if (internDump(String(json.answer || ''))) {
    throw new Error('intern copy leaked into the staff answer');
  }

  const cited = (json.citations || []).map((c: { page: number }) => c.page);
  if (!cited.some((n: number) => RELEVANT_PAGES.includes(n))) {
    throw new Error('citations not relevant');
  }

  const hasWriterKey = Boolean(
    process.env['OPENAI_API_KEY'] ||
      process.env['SHIPMENT_TRACKING_OPENAI_API_KEY'] ||
      process.env['ANTHROPIC_API_KEY'] ||
      getJson.configured,
  );

  if (hasWriterKey && getJson.configured) {
    if (json.fallback) {
      throw new Error(`expected a written answer when a writer is configured; error=${json.error || 'none'}`);
    }
    if (!json.model) throw new Error('written answer missing model');
    if (!/load job/i.test(json.answer)) throw new Error('written answer should mention Load Job');
    if (!/\b(mould|mold|spindle)/i.test(json.answer)) throw new Error('written answer missing tooling steps');
    if (/writer is offline/i.test(json.answer)) throw new Error('writer-offline fallback leaked into a live answer');
  } else {
    if (!json.fallback) throw new Error('expected fallback without API key');
    if (!/writer is offline/i.test(json.answer)) throw new Error('missing staff-friendly offline line');
    if (!/1-844-468-4795/.test(json.answer)) throw new Error('missing Viryl phone');
  }

  console.log('API smoke OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
