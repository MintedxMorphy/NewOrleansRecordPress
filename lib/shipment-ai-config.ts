import { appendRow, findRow, updateRow } from '@/lib/sheets';

const API_KEY_CACHE_KEY = 'shipment_ai_api_key';
const MODEL_CACHE_KEY = 'shipment_ai_model';
const DEFAULT_MODEL = 'gpt-5.5';

export async function getShipmentAiApiKey(): Promise<string> {
  const envKey = process.env.OPENAI_API_KEY || process.env.SHIPMENT_TRACKING_OPENAI_API_KEY || '';
  if (envKey) return envKey;

  try {
    const cached = await findRow('qbo_cache', 'key', API_KEY_CACHE_KEY);
    return cached?.row.value || '';
  } catch {
    return '';
  }
}

export async function getShipmentAiModel(): Promise<string> {
  const envModel = process.env.SHIPMENT_TRACKING_AI_MODEL || '';
  if (envModel) return envModel;

  try {
    const cached = await findRow('qbo_cache', 'key', MODEL_CACHE_KEY);
    return cached?.row.value || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export async function saveShipmentAiApiKey(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error('GPT/OpenAI API key is required');

  const row = {
    key: API_KEY_CACHE_KEY,
    value: trimmed,
    updated_at: new Date().toISOString(),
  };

  const existing = await findRow('qbo_cache', 'key', API_KEY_CACHE_KEY);
  if (existing) await updateRow('qbo_cache', existing.rowIndex, row);
  else await appendRow('qbo_cache', row);

  return { saved: true };
}

export async function isShipmentAiReady() {
  return Boolean(await getShipmentAiApiKey());
}
