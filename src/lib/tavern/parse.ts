import type { CardCode, ScriptButton, TavernRegex, TavernScript } from './types';
import { asString } from '../util';

type Dict = Record<string, unknown>;

function isDict(v: unknown): v is Dict {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function pickString(obj: Dict, key: string, fallback = ''): string {
  const value = obj[key];
  return typeof value === 'string' ? value : fallback;
}

function pickBool(obj: Dict, key: string, fallback = false): boolean {
  const value = obj[key];
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeButtons(raw: unknown): { enabled: boolean; buttons: ScriptButton[] } {
  const fallback = { enabled: false, buttons: [] as ScriptButton[] };
  if (!isDict(raw)) return fallback;
  const buttons = Array.isArray(raw.buttons)
    ? raw.buttons
        .filter(isDict)
        .map((b) => ({ name: asString(b.name).trim(), visible: pickBool(b, 'visible', true) }))
        .filter((b) => b.name)
    : [];
  return { enabled: pickBool(raw, 'enabled', buttons.length > 0), buttons };
}

function normalizeScript(raw: unknown, index: number): TavernScript | null {
  if (!isDict(raw)) return null;
  const content = pickString(raw, 'content');
  if (!content.trim()) return null;
  const id = asString(raw.id).trim() || `script-${index}`;
  return {
    id,
    name: asString(raw.name).trim() || `脚本 ${index + 1}`,
    content,
    enabled: pickBool(raw, 'enabled', true),
    info: pickString(raw, 'info'),
    button: normalizeButtons(raw.button),
  };
}

function normalizeRegex(raw: unknown, index: number): TavernRegex | null {
  if (!isDict(raw)) return null;
  const findRegex = pickString(raw, 'findRegex');
  if (!findRegex.trim()) return null;
  const placement = Array.isArray(raw.placement)
    ? raw.placement.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [2];
  return {
    id: asString(raw.id).trim() || `regex-${index}`,
    scriptName: asString(raw.scriptName).trim() || `正则 ${index + 1}`,
    findRegex,
    replaceString: pickString(raw, 'replaceString'),
    trimStrings: Array.isArray(raw.trimStrings)
      ? raw.trimStrings.map((s) => asString(s)).filter(Boolean)
      : [],
    placement,
    disabled: pickBool(raw, 'disabled', false),
    markdownOnly: pickBool(raw, 'markdownOnly', false),
    promptOnly: pickBool(raw, 'promptOnly', false),
    runOnEdit: pickBool(raw, 'runOnEdit', false),
    substituteRegex: Number(raw.substituteRegex ?? 0) || 0,
    minDepth: raw.minDepth === null || raw.minDepth === undefined ? null : Number(raw.minDepth),
    maxDepth: raw.maxDepth === null || raw.maxDepth === undefined ? null : Number(raw.maxDepth),
  };
}

/**
 * Reads Tavern Helper scripts (and SillyTavern regex scripts) out of a card's
 * `data.extensions`. Returns null when the card carries no executable code.
 */
export function extractCardCode(extensions: unknown): CardCode | null {
  if (!isDict(extensions)) return null;

  const helper = extensions.tavern_helper;
  const rawScripts = isDict(helper) && Array.isArray(helper.scripts) ? helper.scripts : [];
  const scripts = rawScripts
    .map((raw, i) => normalizeScript(raw, i))
    .filter((s): s is TavernScript => Boolean(s));

  const rawRegex = Array.isArray(extensions.regex_scripts) ? extensions.regex_scripts : [];
  const regexScripts = rawRegex
    .map((raw, i) => normalizeRegex(raw, i))
    .filter((r): r is TavernRegex => Boolean(r));

  const depthPromptRaw = extensions.depth_prompt;
  let depthPrompt = '';
  let depthPromptDepth = 4;
  let depthPromptRole = 0;
  if (typeof depthPromptRaw === 'string') {
    depthPrompt = depthPromptRaw;
  } else if (isDict(depthPromptRaw)) {
    depthPrompt = pickString(depthPromptRaw, 'prompt');
    depthPromptDepth = Number(depthPromptRaw.depth ?? 4) || 4;
    depthPromptRole = Number(depthPromptRaw.role ?? 0) || 0;
  }

  if (!scripts.length && !regexScripts.length && !depthPrompt.trim()) return null;
  return {
    scripts,
    regexScripts,
    depthPrompt: depthPrompt.trim() || undefined,
    depthPromptDepth,
    depthPromptRole,
  };
}
