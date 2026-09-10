/**
 * Anthropic key access for WarmTone Help (optional backup writer).
 *
 * Next.js statically replaces `process.env.ANTHROPIC_API_KEY` at build time.
 * Preview builds often do not have that secret (Vercel Production-only), so the
 * replacement becomes `undefined` and the route reports configured:false even
 * when a later runtime env would have the key. Bracket / env-object access is
 * evaluated at request time on the Node server.
 *
 * GPT (`OPENAI_API_KEY` / shipment AI helpers) is the primary WarmTone Help
 * writer. Claude is used only if GPT is missing or fails.
 */
export function getAnthropicApiKey(): string {
  const env = process.env;
  return String(env['ANTHROPIC_API_KEY'] || '').trim();
}

export function isAnthropicConfigured(): boolean {
  return getAnthropicApiKey().length > 0;
}
