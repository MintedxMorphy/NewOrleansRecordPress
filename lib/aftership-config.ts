import { appendRow, findRow, updateRow } from '@/lib/sheets';

const CACHE_KEY = 'aftership_api_key';

export async function getAfterShipApiKey(): Promise<string> {
  const envKey = process.env.AFTERSHIP_API_KEY || process.env.AFTERSHIP_API_KEY_V2 || '';
  if (envKey) return envKey;

  try {
    const cached = await findRow('qbo_cache', 'key', CACHE_KEY);
    return cached?.row.value || '';
  } catch {
    return '';
  }
}

export async function saveAfterShipApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error('AfterShip API key is required');

  const row = {
    key: CACHE_KEY,
    value: trimmed,
    updated_at: new Date().toISOString(),
  };

  const existing = await findRow('qbo_cache', 'key', CACHE_KEY);
  if (existing) await updateRow('qbo_cache', existing.rowIndex, row);
  else await appendRow('qbo_cache', row);

  return { saved: true };
}

export async function isAfterShipReady() {
  const key = await getAfterShipApiKey();
  return Boolean(key);
}
