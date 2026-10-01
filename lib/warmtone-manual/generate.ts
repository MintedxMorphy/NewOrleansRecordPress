import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_CHAT_FALLBACK_MODEL,
  getAnthropicApiKey,
  resolveOpenAiApiKey,
  resolveOpenAiModel,
} from './llm-env';
import {
  formatManualContext,
  getManualMeta,
  getPlantCard,
  type RetrievedPage,
} from './retrieve';
import type { Playbook } from './playbooks';
import type { HelpImage } from './images';
import { imageDataUrl } from './images';

export const CLAUDE_MODEL = 'claude-sonnet-4-5';
const VIRYL_PHONE = '1-844-468-4795';
const MAX_QUESTION = 2000;

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string | OpenAiContent;
};

type OpenAiTextPart = { type: 'text'; text: string };
type OpenAiImagePart = { type: 'image_url'; image_url: { url: string } };
type OpenAiContent = string | Array<OpenAiTextPart | OpenAiImagePart>;

type ClaudeUserContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    >;

export type GenerateResult = {
  text: string;
  model: string | null;
  provider: 'openai' | 'anthropic' | null;
  error?: string;
};

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
- Keep answers tight. No sales talk. No Finebilt advice unless asked.
- The manual is confidential to Viryl/NORP — do not tell the user to republish it.
- If a photo is attached, look at it first: read HMI screens, fault numbers, warning lights, leaks, moulds, stampers, hoses, and part labels. Name what you see, then give steps. If a fault code is visible, treat that as the operator's question.
- Do not browse the web. Answer only from the photo (if any), the manual pages, the NORP plant card, and any attached playbook.
${playbookText ? `\nA NORP plant playbook is attached for this question. Use it as the checklist spine, still citing the manual pages.\n` : ''}`;
}

function textFromOpenAi(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  const chatText = data?.choices?.[0]?.message?.content;
  if (typeof chatText === 'string') return chatText;
  const output = data?.output;
  if (Array.isArray(output)) {
    return output
      .flatMap((item: any) => item.content || [])
      .map((content: any) => content.text || '')
      .join('\n');
  }
  return '';
}

function extractClaudeText(content: Anthropic.ContentBlock[]): string {
  let text = '';
  for (const block of content as any[]) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      text += block.text;
    }
  }
  return text.trim();
}

function uniqueModels(primary: string): string[] {
  const models = [primary || DEFAULT_OPENAI_MODEL];
  if (!models.includes(OPENAI_CHAT_FALLBACK_MODEL)) {
    models.push(OPENAI_CHAT_FALLBACK_MODEL);
  }
  return models;
}

export function buildUserPayload(question: string, retrieved: RetrievedPage[], playbook: Playbook | null): string {
  const playbookBlock = playbook
    ? `\n\nNORP plant playbook (${playbook.title}) — use as the checklist spine; still cite the manual; do not invent setpoints:\n${playbook.text}`
    : '';
  return `Operator question:\n${question}\n\nRetrieved WarmTone manual pages:\n${formatManualContext(retrieved)}${playbookBlock}\n\nAnswer only from the manual pages, the NORP plant card, and any attached playbook. Write numbered steps the operator can follow.`;
}

export function sanitizeHistory(messages: ChatTurn[]): ChatTurn[] {
  const history = messages.map((message) => ({
    role: message.role,
    content: typeof message.content === 'string' ? message.content.slice(0, MAX_QUESTION) : message.content,
  }));
  return history.slice(0, -1).filter((message, index, list) => {
    if (index === 0) return message.role === 'user';
    return message.role !== list[index - 1].role;
  });
}

function openAiUserContent(text: string, images: HelpImage[]): OpenAiContent {
  if (images.length === 0) return text;
  return [
    { type: 'text', text },
    ...images.map((image) => ({
      type: 'image_url' as const,
      image_url: { url: imageDataUrl(image) },
    })),
  ];
}

function claudeUserContent(text: string, images: HelpImage[]): ClaudeUserContent {
  if (images.length === 0) return text;
  return [
    ...images.map((image) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: image.mimeType,
        data: image.data,
      },
    })),
    { type: 'text' as const, text },
  ];
}

async function completeWithOpenAi(
  apiKey: string,
  model: string,
  system: string,
  messages: ChatTurn[],
  options?: { maxTokens?: number },
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { error?: { message?: string } }).error?.message || `OpenAI failed (${res.status})`;
    throw new Error(detail);
  }
  const text = textFromOpenAi(data).trim();
  if (!text) throw new Error('OpenAI returned an empty answer');
  return text;
}

async function completeWithClaude(
  apiKey: string,
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: ClaudeUserContent }>,
): Promise<string> {
  const anthropic = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 0 });
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1400,
    system,
    messages,
  });
  const text = extractClaudeText(response.content);
  if (!text) throw new Error('Claude returned an empty answer');
  return text;
}

export async function searchHintFromImages(images: HelpImage[]): Promise<string> {
  if (images.length === 0) return '';
  const apiKey = await resolveOpenAiApiKey();
  if (!apiKey) return '';
  const prompt =
    'Look at the WarmTone photo(s). Reply with one line of search terms for the Viryl owners manual: fault numbers, HMI screen names, part names, leaks, moulds, stampers. No advice. Max 20 words.';
  const messages: ChatTurn[] = [{ role: 'user', content: openAiUserContent(prompt, images) }];
  const models = uniqueModels(await resolveOpenAiModel());
  for (const model of models) {
    try {
      const text = await completeWithOpenAi(
        apiKey,
        model,
        'You extract search terms from WarmTone press photos for a manual lookup.',
        messages,
        { maxTokens: 80 },
      );
      return text.replace(/\s+/g, ' ').trim().slice(0, 200);
    } catch {
      continue;
    }
  }
  return '';
}

export async function generateWarmtoneAnswer(input: {
  question: string;
  retrieved: RetrievedPage[];
  playbook: Playbook | null;
  history: ChatTurn[];
  images?: HelpImage[];
}): Promise<GenerateResult> {
  const images = input.images || [];
  const system = systemPrompt(input.playbook?.text || null);
  const userPayload =
    buildUserPayload(input.question, input.retrieved, input.playbook) +
    (images.length
      ? `\n\nThe operator attached ${images.length} photo(s) of the WarmTone, HMI, or a part. Read the photo(s) first. If a fault number or screen name is visible, use that.`
      : '');
  const prior = sanitizeHistory(input.history);
  const openaiMessages: ChatTurn[] = [...prior, { role: 'user', content: openAiUserContent(userPayload, images) }];
  const claudeMessages = [
    ...prior.map((turn) => ({
      role: turn.role,
      content: typeof turn.content === 'string' ? turn.content : userPayload,
    })),
    { role: 'user' as const, content: claudeUserContent(userPayload, images) },
  ];

  const openaiKey = await resolveOpenAiApiKey();
  const errors: string[] = [];

  if (openaiKey) {
    const models = uniqueModels(await resolveOpenAiModel());
    for (const model of models) {
      try {
        const text = await completeWithOpenAi(openaiKey, model, system, openaiMessages);
        return { text, model, provider: 'openai' };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'OpenAI request failed';
        errors.push(`${model}: ${detail}`);
        const retryable = /model|empty answer|not found|does not exist|unsupported/i.test(detail);
        if (!retryable) break;
      }
    }
  }

  const anthropicKey = getAnthropicApiKey();
  if (anthropicKey) {
    try {
      const text = await completeWithClaude(anthropicKey, system, claudeMessages);
      return { text, model: CLAUDE_MODEL, provider: 'anthropic' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Claude request failed';
      errors.push(`${CLAUDE_MODEL}: ${detail}`);
    }
  }

  return {
    text: '',
    model: null,
    provider: null,
    error: errors[0] || (openaiKey || anthropicKey ? 'assistant model was unavailable' : 'no writer key'),
  };
}
