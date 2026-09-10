import assert from 'node:assert/strict';
import { generateWarmtoneAnswer } from '../lib/warmtone-manual/generate.ts';
import { retrieveManualPages, playbookForQuestion } from '../lib/warmtone-manual/retrieve.ts';
import { isWarmtoneLlmConfiguredFromEnv, preferredWriterFromEnv } from '../lib/warmtone-manual/llm-env.ts';

const QUESTION =
  'changing a 12" mold to a 7" mold and what settings need to change';

async function testConfiguredFlag() {
  const originalOpen = process.env.OPENAI_API_KEY;
  const originalShip = process.env.SHIPMENT_TRACKING_OPENAI_API_KEY;
  const originalAnthropic = process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.SHIPMENT_TRACKING_OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(isWarmtoneLlmConfiguredFromEnv(), false);
  assert.equal(preferredWriterFromEnv(), null);

  process.env.OPENAI_API_KEY = 'sk-test';
  assert.equal(isWarmtoneLlmConfiguredFromEnv(), true);
  assert.equal(preferredWriterFromEnv(), 'openai');

  delete process.env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'ant-test';
  assert.equal(isWarmtoneLlmConfiguredFromEnv(), true);
  assert.equal(preferredWriterFromEnv(), 'anthropic');

  process.env.OPENAI_API_KEY = originalOpen;
  process.env.SHIPMENT_TRACKING_OPENAI_API_KEY = originalShip;
  process.env.ANTHROPIC_API_KEY = originalAnthropic;
  if (!originalOpen) delete process.env.OPENAI_API_KEY;
  if (!originalShip) delete process.env.SHIPMENT_TRACKING_OPENAI_API_KEY;
  if (!originalAnthropic) delete process.env.ANTHROPIC_API_KEY;
}

async function testGptWriter() {
  const originalOpen = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'sk-test-warmtone';

  let calledModel = '';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.match(url, /api\.openai\.com\/v1\/chat\/completions/);
    const body = JSON.parse(String(init?.body || '{}'));
    calledModel = body.model;
    assert.equal(body.tools, undefined);
    const user = body.messages.find((m: { role: string }) => m.role === 'user')?.content || '';
    assert.match(user, /Operator question/);
    assert.match(user, /Retrieved WarmTone manual pages/);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                '1. Cool and lock out (Manual p.104).\n2. Swap moulds (Manual p.106).\n3. Change spindles (Manual p.99).\n4. Load Job for 7-inch and confirm Heat / Dwell / Cool (Manual p.63).',
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const retrieved = retrieveManualPages(QUESTION);
  const result = await generateWarmtoneAnswer({
    question: QUESTION,
    retrieved,
    playbook: playbookForQuestion(QUESTION),
    history: [{ role: 'user', content: QUESTION }],
  });

  globalThis.fetch = originalFetch;
  process.env.OPENAI_API_KEY = originalOpen;
  if (!originalOpen) delete process.env.OPENAI_API_KEY;

  assert.equal(result.provider, 'openai');
  assert.ok(result.model);
  assert.equal(calledModel, result.model);
  assert.match(result.text, /Load Job/);
  assert.doesNotMatch(result.text, /writer is offline/i);
  console.log('GPT writer mock OK', { model: result.model, provider: result.provider });
}

async function main() {
  await testConfiguredFlag();
  await testGptWriter();
  console.log('generate tests OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
