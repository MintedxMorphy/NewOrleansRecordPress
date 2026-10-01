export const HELP_STORAGE_KEY = 'norp-warmtone-help-v1';
export const MAX_STORED_MESSAGES = 80;
export const MAX_STORED_IMAGE_MESSAGES = 10;
export const MAX_MACHINE_NOTES = 40;
export const MAX_NOTE_CHARS = 240;

export type StoredHelpMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrls?: string[];
  citations?: { page: number; heading: string; snippet: string }[];
  webSources?: { title: string; url: string }[];
  fallback?: boolean;
};

export type HelpMemory = {
  version: 1;
  updatedAt: string;
  messages: StoredHelpMessage[];
  machineNotes: string[];
};

const NOTES_BLOCK = /<!--norp-notes\s*([\s\S]*?)-->/i;

export function emptyHelpMemory(): HelpMemory {
  return { version: 1, updatedAt: new Date().toISOString(), messages: [], machineNotes: [] };
}

export function splitNotesFooter(text: string): { answer: string; notes: string[] } {
  const raw = String(text || '');
  const match = raw.match(NOTES_BLOCK);
  if (!match) return { answer: raw.trim(), notes: [] };
  const answer = raw.replace(NOTES_BLOCK, '').trim();
  const notes = match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter((line) => line.length >= 8);
  return { answer, notes };
}

export function mergeMachineNotes(existing: string[], incoming: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const note of [...existing, ...incoming]) {
    const clean = String(note || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_NOTE_CHARS);
    const key = clean.toLowerCase();
    if (clean.length < 8 || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.slice(-MAX_MACHINE_NOTES);
}

export function parseMachineNotes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return mergeMachineNotes(
    [],
    raw.filter((item) => typeof item === 'string'),
  );
}

function isDataImage(url: string) {
  return /^data:image\/(jpeg|png|webp|gif);base64,/i.test(url);
}

export function pruneHelpMemory(memory: HelpMemory): HelpMemory {
  const messages = memory.messages.slice(-MAX_STORED_MESSAGES).map((message) => ({
    ...message,
    content: String(message.content || '').slice(0, 4000),
    imageUrls: Array.isArray(message.imageUrls)
      ? message.imageUrls.filter((url) => typeof url === 'string' && url.length < 900_000 && (isDataImage(url) || url.startsWith('blob:'))).slice(0, 3)
      : undefined,
  }));
  let imageBudget = MAX_STORED_IMAGE_MESSAGES;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const urls = messages[i].imageUrls || [];
    if (urls.length === 0) continue;
    if (imageBudget <= 0) {
      messages[i] = { ...messages[i], imageUrls: undefined };
    } else {
      imageBudget -= 1;
    }
  }
  return {
    version: 1,
    updatedAt: memory.updatedAt || new Date().toISOString(),
    messages,
    machineNotes: mergeMachineNotes([], memory.machineNotes),
  };
}

export function loadHelpMemory(): HelpMemory {
  if (typeof window === 'undefined') return emptyHelpMemory();
  try {
    const raw = window.localStorage.getItem(HELP_STORAGE_KEY);
    if (!raw) return emptyHelpMemory();
    const parsed = JSON.parse(raw) as HelpMemory;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.messages)) return emptyHelpMemory();
    return pruneHelpMemory({
      version: 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      messages: parsed.messages.filter(
        (message) =>
          message &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string',
      ),
      machineNotes: parseMachineNotes(parsed.machineNotes),
    });
  } catch {
    return emptyHelpMemory();
  }
}

export function saveHelpMemory(memory: HelpMemory) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      HELP_STORAGE_KEY,
      JSON.stringify(
        pruneHelpMemory({
          ...memory,
          version: 1,
          updatedAt: new Date().toISOString(),
        }),
      ),
    );
  } catch {
    try {
      window.localStorage.setItem(
        HELP_STORAGE_KEY,
        JSON.stringify(
          pruneHelpMemory({
            ...memory,
            messages: memory.messages.map((message) => ({ ...message, imageUrls: undefined })),
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
    } catch {
      // Private mode or quota — keep the in-memory thread only.
    }
  }
}
