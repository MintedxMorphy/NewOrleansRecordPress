/**
 * Anthropic key access for WarmTone Help.
 *
 * Next.js statically replaces `process.env.ANTHROPIC_API_KEY` at build time.
 * Preview builds often do not have that secret (Vercel Production-only), so the
 * replacement becomes `undefined` and the route reports configured:false even
 * when a later runtime env would have the key. Bracket / env-object access is
 * evaluated at request time on the Node server.
 *
 * Same variable name as scan-email / morning-briefing. Do not add a second paid
 * provider. Production must have ANTHROPIC_API_KEY (Preview only if Claude
 * should answer on preview URLs).
 */
export function getAnthropicApiKey(): string {
  const env = process.env;
  return String(env['ANTHROPIC_API_KEY'] || '').trim();
}

export function isAnthropicConfigured(): boolean {
  return getAnthropicApiKey().length > 0;
}
