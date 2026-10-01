import { NextRequest, NextResponse } from 'next/server';
import { generateWarmtoneAnswer, searchHintFromImages } from '@/lib/warmtone-manual/generate';
import { parseHelpImages } from '@/lib/warmtone-manual/images';
import { mergeMachineNotes, parseMachineNotes, splitNotesFooter } from '@/lib/warmtone-manual/memory';
import { appendHelpTurn, persistHelpImages, readHelpMemory } from '@/lib/warmtone-manual/store';
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
const MAX_HISTORY = 30;
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

  let body: { messages?: ChatMessage[]; images?: unknown; machineNotes?: unknown } = {};
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

  const images = parseHelpImages(body.images);
  const stored = await readHelpMemory();
  const machineNotes = mergeMachineNotes(stored.machineNotes, parseMachineNotes(body.machineNotes));
  const question =
    [...cleaned].reverse().find((message) => message.role === 'user')?.content ||
    (images.length ? 'What does this WarmTone photo show, and what should I do?' : '');
  if (!question) {
    return NextResponse.json({ error: 'Ask a question or attach a photo of the WarmTone.' }, { status: 400 });
  }
  if (question.length > MAX_QUESTION) {
    return NextResponse.json({ error: 'Keep the question under 2,000 characters.' }, { status: 400 });
  }

  const storedTurns = stored.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const lastStored = storedTurns[storedTurns.length - 1];
  const history =
    lastStored?.role === 'user' && lastStored.content === question
      ? storedTurns.slice(-MAX_HISTORY)
      : [...storedTurns, { role: 'user' as const, content: question }].slice(-MAX_HISTORY);

  let searchText = question;
  const priorUser = history
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content)
    .join(' ');
  if (images.length > 0) {
    const hint = await searchHintFromImages(images);
    if (hint) searchText = `${question} ${hint}`;
  }

  const retrieved = retrieveManualPages(`${priorUser} ${searchText}`.trim());
  const citations = citationsFrom(retrieved);
  const playbook = playbookForQuestion(`${priorUser} ${searchText}`);

  const generated = await generateWarmtoneAnswer({
    question,
    retrieved,
    playbook,
    history,
    images,
    machineNotes,
  });

  const userContent =
    [...cleaned].reverse().find((message) => message.role === 'user')?.content || question;
  const imageUrls = images.length ? await persistHelpImages(images) : undefined;
  const userMessage = {
    id: `u-${Date.now()}`,
    role: 'user' as const,
    content: userContent,
    imageUrls,
  };

  if (generated.text) {
    const split = splitNotesFooter(generated.text);
    const nextNotes = mergeMachineNotes(machineNotes, split.notes);
    const assistantMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant' as const,
      content: split.answer,
      citations,
      fallback: false,
    };
    let memory = stored;
    try {
      memory = await appendHelpTurn({
        user: userMessage,
        assistant: assistantMessage,
        machineNotes: nextNotes,
      });
    } catch {
      memory = {
        version: 1,
        updatedAt: new Date().toISOString(),
        messages: [...stored.messages, userMessage, assistantMessage],
        machineNotes: nextNotes,
      };
    }
    return NextResponse.json({
      answer: split.answer,
      citations,
      usedWebSearch: false,
      webSources: [],
      model: generated.model,
      provider: generated.provider,
      fallback: false,
      machineNotes: memory.machineNotes,
      memory,
      shared: true,
      manual: getManualMeta(),
    });
  }

  const fallback = fallbackAnswer(retrieved);
  const assistantMessage = {
    id: `a-${Date.now()}`,
    role: 'assistant' as const,
    content: fallback,
    citations,
    fallback: true,
  };
  let memory = stored;
  try {
    memory = await appendHelpTurn({
      user: userMessage,
      assistant: assistantMessage,
      machineNotes,
    });
  } catch {
    memory = {
      version: 1,
      updatedAt: new Date().toISOString(),
      messages: [...stored.messages, userMessage, assistantMessage],
      machineNotes,
    };
  }

  return NextResponse.json({
    answer: fallback,
    citations,
    usedWebSearch: false,
    webSources: [],
    model: null,
    provider: null,
    fallback: true,
    error: generated.error,
    machineNotes: memory.machineNotes,
    memory,
    shared: true,
    manual: getManualMeta(),
  });
}
