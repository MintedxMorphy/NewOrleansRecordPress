import { NextRequest } from 'next/server';
import { POST, GET } from '../app/api/staff/warmtone-help/route.ts';

const QUESTION =
  'changing a 12" mold to a 7" mold and what settings need to change';

async function main() {
  const getRes = await GET();
  const getJson = await getRes.json();
  console.log('GET', { configured: getJson.configured, runtime: getJson.runtime, hasKey: Boolean(process.env['ANTHROPIC_API_KEY']) });

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
  console.log('answer:\n' + json.answer);
  console.log(
    'citations:',
    (json.citations || []).map((c: { page: number; heading: string }) => `p.${c.page} ${c.heading}`).join(' | '),
  );

  if (!process.env['ANTHROPIC_API_KEY']) {
    if (!json.fallback) throw new Error('expected fallback without API key');
    if (/not configured on this server/i.test(json.answer)) throw new Error('intern copy leaked');
    if (!/writer is offline/i.test(json.answer)) throw new Error('missing staff-friendly offline line');
    if (!/1-844-468-4795/.test(json.answer)) throw new Error('missing Viryl phone');
    const cited = (json.citations || []).map((c: { page: number }) => c.page);
    if (!cited.some((n: number) => [104, 105, 106, 99, 100, 61, 63, 68].includes(n))) {
      throw new Error('citations not relevant');
    }
  }

  console.log('API smoke OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
