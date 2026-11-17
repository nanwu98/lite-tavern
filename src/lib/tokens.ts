/**
 * Rough token accounting.
 *
 * We deliberately do not ship a tokenizer: a BPE table would add ~1 MB to the
 * bundle for an estimate that only needs to answer "is the prompt close to the
 * window?". CJK characters are close to one token each for the models this app
 * talks to,
 * Latin text averages ~3.6 characters per token. The estimate over-counts
 * slightly on mixed text, which makes compaction trigger a little early instead
 * of failing at the provider.
 */

export interface TokenMessage {
  role: string;
  content: string;
}

const CJK =
  /[\u2e80-\u2fff\u3001-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;

/** Estimated tokens for a plain string. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (CJK.test(char)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk + other / 3.6);
}

/** Estimated tokens for a full chat request (content + per-message overhead). */
export function estimateMessagesTokens(messages: TokenMessage[]): number {
  let total = 3; // request framing
  for (const message of messages) {
    // Every message carries the role plus a few delimiter tokens.
    total += 4 + estimateTokens(message.content);
  }
  return total;
}

/** `12345` → `12.3k`, keeps the UI compact. */
export function formatTokenCount(tokens: number): string {
  const value = Math.max(0, Math.round(tokens));
  if (value < 1000) return String(value);
  if (value < 100_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(value / 1000)}k`;
}

export function formatLimit(tokens: number): string {
  const value = Math.max(0, Math.round(tokens));
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  return `${Math.round(value / 1024)}K`;
}
