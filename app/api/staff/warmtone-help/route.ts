import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicApiKey, isAnthropicConfigured } from '@/lib/warmtone-manual/anthropic-env';
import {
  formatManualContext,
  getManualMeta,
  getPlantCard,
  pageTitle,
  playbookForQuestion,
  retrieveManualPages,
  shouldSearchWeb,
  type RetrievedPage,
} from '@/lib/warmtone-manual/retrieve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-5';
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

type WebSource = {
  title: string;
  url: string;
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

function systemPrompt(playbookText: string | null) {
  return `You are the in-house WarmTone technician for New Orleans Record Press. Employees ask you about the Viryl WarmTone Record Press on the shop floor.

${getPlantCard()}

Source of truth: Viryl WarmTone Operation Manual ${getManualMeta().docId} Rev ${getManualMeta().revision} (${getManualMeta().year}). Always prefer the manual over the internet.

Rules:
- Answer with clear numbered steps an operator can follow at the press.
- Cite manual pages inline like (Manual p. 84).
- Call out warnings, lockout, pinch, steam, hydraulic, and electrical hazards before the steps when they apply.
- If the manual says to contact Viryl support or a support ticket is required, say that plainly. Viryl: ${VIRYL_PHONE} / www.viryltech.com.
- Never invent a procedure, setpoint, or spare part number. If the retrieved pages are not enough, say what is missing.
- For size / mould changes: tell the operator to Load Job for the target size and confirm Heat / Dwell / Cool / pressure on the HMI from that saved job or Viryl tables. Do not fabricate numbers.
- Web results are unofficial field notes. If you use them, label them "From the field" and never let them override a safety or lockout step in the manual.
- Keep answers tight. No sales talk. No Finebilt advice unless asked.
- The manual is confidential to Viryl/NORP — do not tell the user to republish it.
${playbookText ? `\nA NORP plant playbook is attached for this question. Use it as the checklist spine, still citing the manual pages.\n` : ''}`;
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

function extractClaudeResult(content: Anthropic.ContentBlock[]): { text: string; webSources: WebSource[] } {
  let text = '';
  const webSources: WebSource[] = [];
  const seen = new Set<string>();

  for (const block of content as any[]) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      text += block.text;
      const cites = Array.isArray(block.citations) ? block.citations : [];
      for (const cite of cites) {
        const url = String(cite.url || cite.source || '');
        if (!url || seen.has(url)) continue;
        seen.add(url);
        webSources.push({ title: String(cite.title || url), url });
      }
    }
    const results = block?.content || block?.web_search_tool_result || [];
    if (Array.isArray(results)) {
      for (const item of results) {
        const link = item?.url;
        if (!link || seen.has(link)) continue;
        seen.add(link);
        webSources.push({ title: String(item.title || link), url: String(link) });
      }
    }
  }

  return { text: text.trim(), webSources };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: isAnthropicConfigured(),
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
  const useWeb = shouldSearchWeb(question, retrieved);
  const apiKey = getAnthropicApiKey();

  if (!apiKey) {
    return NextResponse.json({
      answer: fallbackAnswer(retrieved),
      citations,
      usedWebSearch: false,
      webSources: [] as WebSource[],
      model: null,
      fallback: true,
      manual: getManualMeta(),
    });
  }

  const anthropic = new Anthropic({ apiKey });
  const history = cleaned.map((message) => ({
    role: message.role,
    content: message.content.slice(0, MAX_QUESTION),
  }));
  const prior = history.slice(0, -1).filter((message, index, list) => {
    if (index === 0) return message.role === 'user';
    return message.role !== list[index - 1].role;
  });

  const playbookBlock = playbook
    ? `\n\nNORP plant playbook (${playbook.title}) — use as the checklist spine; still cite the manual; do not invent setpoints:\n${playbook.text}`
    : '';

  const userPayload = `Operator question:\n${question}\n\nRetrieved WarmTone manual pages:\n${formatManualContext(retrieved)}${playbookBlock}\n\n${
    useWeb
      ? 'The manual match looks thin or the operator asked for field/case-study backup. You may use web search. Prefer Viryl WarmTone / vinyl plant sources. Cite URLs. Manual still wins on safety.'
      : 'Do not browse the web. Answer only from the manual pages, the NORP plant card, and any attached playbook.'
  }`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1400,
      system: systemPrompt(playbook?.text || null),
      messages: [
        ...prior,
        { role: 'user', content: userPayload },
      ],
      ...(useWeb
        ? {
            tools: [
              {
                type: 'web_search_20250305',
                name: 'web_search',
                max_uses: 2,
              } as any,
            ],
          }
        : {}),
    });

    const { text, webSources } = extractClaudeResult(response.content);
    return NextResponse.json({
      answer:
        text ||
        fallbackAnswer(retrieved),
      citations,
      usedWebSearch: useWeb,
      webSources,
      model: MODEL,
      fallback: !text,
      manual: getManualMeta(),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Claude request failed';
    // Retry without web search if the tool type is unsupported.
    if (useWeb) {
      try {
        const retry = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1400,
          system: systemPrompt(playbook?.text || null),
          messages: [
            ...prior,
            {
              role: 'user',
              content: `Operator question:\n${question}\n\nRetrieved WarmTone manual pages:\n${formatManualContext(retrieved)}${playbookBlock}\n\nAnswer only from the manual pages and any attached playbook.`,
            },
          ],
        });
        const { text, webSources } = extractClaudeResult(retry.content);
        return NextResponse.json({
          answer: text || fallbackAnswer(retrieved),
          citations,
          usedWebSearch: false,
          webSources,
          model: MODEL,
          fallback: !text,
          manual: getManualMeta(),
        });
      } catch {
        // fall through
      }
    }

    return NextResponse.json({
      answer: fallbackAnswer(retrieved),
      citations,
      usedWebSearch: false,
      webSources: [] as WebSource[],
      model: null,
      fallback: true,
      error: detail,
      manual: getManualMeta(),
    });
  }
}
