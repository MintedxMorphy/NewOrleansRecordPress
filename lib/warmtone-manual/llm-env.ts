import { getShipmentAiApiKey, getShipmentAiModel } from '@/lib/shipment-ai-config';
import { getAnthropicApiKey, isAnthropicConfigured } from './anthropic-env';

/**
 * WarmTone Help writer keys.
 *
 * GPT is the reliable shop-floor writer (same OPENAI_API_KEY / model as
 * shipment tracking). Claude is optional if Anthropic is configured and GPT
 * fails. Bracket-access env reads so Next.js does not bake `undefined` in at
 * Preview build time.
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
export const OPENAI_CHAT_FALLBACK_MODEL = 'gpt-4o';

function envValue(name: string): string {
  return String(process.env[name] || '').trim();
}

export function getOpenAiApiKeyFromEnv(): string {
  return envValue('OPENAI_API_KEY') || envValue('SHIPMENT_TRACKING_OPENAI_API_KEY');
}

export async function resolveOpenAiApiKey(): Promise<string> {
  const fromEnv = getOpenAiApiKeyFromEnv();
  if (fromEnv) return fromEnv;
  const canReadSheet =
    Boolean(envValue('GOOGLE_SERVICE_ACCOUNT_KEY')) ||
    Boolean(envValue('GOOGLE_REFRESH_TOKEN') && envValue('GOOGLE_CLIENT_ID'));
  if (!canReadSheet) return '';
  try {
    const fromSheet = Promise.resolve(getShipmentAiApiKey())
      .then((key) => String(key || '').trim())
      .catch(() => '');
    const timeout = new Promise<string>((resolve) => {
      setTimeout(() => resolve(''), 2500);
    });
    return await Promise.race([fromSheet, timeout]);
  } catch {
    return '';
  }
}

export async function resolveOpenAiModel(): Promise<string> {
  const envModel = envValue('SHIPMENT_TRACKING_AI_MODEL');
  if (envModel) return envModel;
  const canReadSheet =
    Boolean(envValue('GOOGLE_SERVICE_ACCOUNT_KEY')) ||
    Boolean(envValue('GOOGLE_REFRESH_TOKEN') && envValue('GOOGLE_CLIENT_ID'));
  if (!canReadSheet) return DEFAULT_OPENAI_MODEL;
  try {
    const model = String((await getShipmentAiModel()) || '').trim();
    return model || DEFAULT_OPENAI_MODEL;
  } catch {
    return DEFAULT_OPENAI_MODEL;
  }
}

export function isWarmtoneLlmConfiguredFromEnv(): boolean {
  return getOpenAiApiKeyFromEnv().length > 0 || isAnthropicConfigured();
}

export function preferredWriterFromEnv(): 'openai' | 'anthropic' | null {
  if (getOpenAiApiKeyFromEnv()) return 'openai';
  if (isAnthropicConfigured()) return 'anthropic';
  return null;
}

export { getAnthropicApiKey, isAnthropicConfigured };
