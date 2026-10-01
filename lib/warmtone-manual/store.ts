import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { readSiteJson, writeSiteJson, uploadSiteImage } from '@/lib/site-storage';
import type { HelpImage } from './images';
import {
  emptyHelpMemory,
  mergeHelpMessages,
  mergeMachineNotes,
  parseHelpMemory,
  pruneHelpMemory,
  type HelpMemory,
  type StoredHelpMessage,
} from './memory';

export const HELP_THREAD_PATH = 'staff/warmtone-help/thread.json';

function fallbackPath() {
  return join(process.cwd(), '.data', 'warmtone-help-thread.json');
}

function readFallback(): HelpMemory {
  try {
    return parseHelpMemory(JSON.parse(readFileSync(fallbackPath(), 'utf8')));
  } catch {
    return emptyHelpMemory();
  }
}

export async function readHelpMemory(): Promise<HelpMemory> {
  return parseHelpMemory(await readSiteJson(HELP_THREAD_PATH, readFallback));
}

export async function writeHelpMemory(memory: HelpMemory): Promise<HelpMemory> {
  const next = pruneHelpMemory({
    ...memory,
    version: 1,
    updatedAt: new Date().toISOString(),
  });
  await writeSiteJson(HELP_THREAD_PATH, next, (value) => {
    const path = fallbackPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value));
  });
  return next;
}

export async function persistHelpImages(images: HelpImage[]): Promise<string[]> {
  const urls: string[] = [];
  for (const image of images) {
    const dataUrl = `data:${image.mimeType};base64,${image.data}`;
    try {
      const ext = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const bytes = Buffer.from(image.data, 'base64');
      const url = await uploadSiteImage(
        `warmtone-help/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
        bytes,
        image.mimeType,
      );
      urls.push(url);
    } catch {
      urls.push(dataUrl);
    }
  }
  return urls;
}

export async function appendHelpTurn(input: {
  user: StoredHelpMessage;
  assistant: StoredHelpMessage;
  machineNotes: string[];
}): Promise<HelpMemory> {
  const current = await readHelpMemory();
  return writeHelpMemory({
    version: 1,
    updatedAt: new Date().toISOString(),
    messages: mergeHelpMessages(current.messages, [input.user, input.assistant]),
    machineNotes: mergeMachineNotes(current.machineNotes, input.machineNotes),
  });
}

export async function resetHelpThread(): Promise<HelpMemory> {
  const current = await readHelpMemory();
  return writeHelpMemory({
    ...emptyHelpMemory(),
    machineNotes: current.machineNotes,
  });
}
