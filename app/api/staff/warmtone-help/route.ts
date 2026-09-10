import { NextRequest, NextResponse } from 'next/server';
import { generateWarmtoneAnswer } from '@/lib/warmtone-manual/generate';
import {
  isWarmtoneLlmConfiguredFromEnv,
  preferredWriterFromEnv,
  resolveOpenAiApiKey,
  resolveOpenAiModel,
  isAnthropicConfigured,
} from '@/lib/warmtone-manual/llm-env';
import {
  getManualMeta,
  pageTitle,
  playbookForQuestion,
  retrieveManualPages,
  type RetrievedPage,
} from '@/lib/warmtone-manual/retrieve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_QUESTION = 2000;
const MAX_HISTORY = 8;
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const VIRYL_PHONE = '1-844-468-4795';

const hits = new Map<string, number[]>();

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function clientIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

function rateLimit(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function fallbackAnswer(pages: RetrievedPage[]): string {
  if (pages.length === 0) {
    return `The writer is offline and no matching manual section turned up. Try a fault number, HMI screen, or part name. Viryl: ${VIRYL_PHONE}.`;
  }
  const lines = pages.slice(0, 5).map((page) => `- Manual p. ${page.page} — ${pageTitle(page)}`);
  return `The writer is offline. Use these manual pages:\n${lines.join('\n')}\nViryl: ${VIRYL_PHONE}.`;
}

function citationsFrom(pages: RetrievedPage[]) {
  return pages.slice(0, 6).map((page) => ({
    page: page.page,
    heading: pageTitle(page),
    snippet: page.snippet,
  }));
}

export async function GET() {
  const openaiKey = await resolveOpenAiApiKey();
  const anthropic = isAnthropicConfigured();
  let openaiModel: string | null = null;
  if (openaiKey) {
    try {
      openaiModel = await resolveOpenAiModel();
    } catch {
      openaiModel = null;
    }
  }

  return NextResponse.json({
    ok: true,
    configured: Boolean(openaiKey) || anthropic || isWarmtoneLlmConfiguredFromEnv(),
    providers: {
      openai: Boolean(openaiKey),
      anthropic,
    },
    writer: openaiKey ? 'openai' : anthropic ? 'anthropic' : preferredWriterFromEnv(),
    openaiModel,
    runtime: 'nodejs',
    manual: getManualMeta(),
  });
}

export async function POST(req: NextRequest) {
  if (!rateLimit(clientIp(req))) {
    return NextResponse.json({ error: 'Too many questions from this network. Try again in a bit.' }, { status: 429 });
  }

  let body: { messages?: ChatMessage[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const cleaned = messages
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content)
    .slice(-MAX_HISTORY);

  const question = [...cleaned].reverse().find((message) => message.role === 'user')?.content || '';
  if (!question) {
    return NextResponse.json({ error: 'Ask a question about the WarmTone.' }, { status: 400 });
  }
  if (question.length > MAX_QUESTION) {
    return NextResponse.json({ error: 'Keep the question under 2,000 characters.' }, { status: 400 });
  }

  const retrieved = retrieveManualPages(question);
  const citations = citationsFrom(retrieved);
  const playbook = playbookForQuestion(question);

  const generated = await generateWarmtoneAnswer({
    question,
    retrieved,
    playbook,
    history: cleaned,
  });

  if (generated.text) {
    return NextResponse.json({
      answer: generated.text,
      citations,
      usedWebSearch: false,
      webSources: [],
      model: generated.model,
      provider: generated.provider,
      fallback: false,
      manual: getManualMeta(),
    });
  }

  return NextResponse.json({
    answer: fallbackAnswer(retrieved),
    citations,
    usedWebSearch: false,
    webSources: [],
    model: null,
    provider: null,
    fallback: true,
    error: generated.error,
    manual: getManualMeta(),
  });
}
