import type { Chat, ChatOverrides, Settings } from '../types';

/**
 * Per-conversation settings.
 *
 * A chat may carry its own context window: a 1M-token model can be used for a
 * long story while a cheaper 64K model runs side by side, and both are open at
 * the same time. Everything else (temperature, model, key, …) stays global, so
 * this is a narrow overlay instead of a second settings object to maintain.
 */

export const MIN_CONTEXT_LIMIT = 2_000;
export const MAX_CONTEXT_LIMIT = 4_000_000;

function clampLimit(value: number): number {
  const rounded = Math.round(Number(value) || 0);
  if (!Number.isFinite(rounded) || rounded <= 0) return 0;
  return Math.min(MAX_CONTEXT_LIMIT, Math.max(MIN_CONTEXT_LIMIT, rounded));
}

/** Sanitises the override block; returns `undefined` when nothing is set. */
export function normalizeOverrides(raw: ChatOverrides | undefined): ChatOverrides | undefined {
  if (!raw) return undefined;
  const limit = clampLimit(raw.contextLimit ?? 0);
  return limit ? { contextLimit: limit } : undefined;
}

/** The context window that actually applies to a chat. */
export function contextLimitFor(settings: Settings, chat: Chat | undefined): number {
  const override = chat?.overrides?.contextLimit;
  if (override) {
    const limit = clampLimit(override);
    if (limit) return limit;
  }
  return Math.max(MIN_CONTEXT_LIMIT, Math.round(settings.contextLimit) || 65_536);
}

/**
 * Global settings with the chat's overrides folded in. Used by the prompt
 * builder, the auto-compaction trigger and the usage meter so all three agree.
 */
export function settingsForChat(settings: Settings, chat: Chat | undefined): Settings {
  const limit = contextLimitFor(settings, chat);
  if (limit === settings.contextLimit) return settings;
  return { ...settings, contextLimit: limit };
}

/** True when this chat differs from the global setting. */
export function hasOverrides(chat: Chat | undefined): boolean {
  return Boolean(chat?.overrides?.contextLimit);
}
