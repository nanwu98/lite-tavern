import type { TavernRegex } from './types';

export interface RegexContext {
  /** Substitutes {{char}}, {{user}} … inside the find/replace strings. */
  macro: (text: string) => string;
  /** Depth of the message being processed (0 = newest). */
  depth?: number;
  /** 'display' for rendered chat text, 'prompt' for text sent to the model. */
  mode: 'display' | 'prompt';
  /** 1 = user input, 2 = AI output (SillyTavern's regex placement numbers). */
  placement?: number;
}

const FALLBACK_PATTERN = /^\/([\s\S]+)\/([a-z]*)$/i;

export function parseRegex(findRegex: string): RegExp | null {
  const trimmed = (findRegex || '').trim();
  if (!trimmed) return null;
  const m = FALLBACK_PATTERN.exec(trimmed);
  try {
    if (m) return new RegExp(m[1], m[2] || '');
    return new RegExp(trimmed);
  } catch {
    return null;
  }
}

/** Expands the replacement patterns Tavern regexes commonly rely on. */
function expandReplacement(template: string, match: string, groups: string[]): string {
  let out = '';
  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    if (ch !== '$') {
      out += ch;
      continue;
    }
    const next = template[i + 1];
    if (next === '$') {
      out += '$';
      i++;
    } else if (next === '&') {
      out += match;
      i++;
    } else if (next === '<') {
      // Named groups are not forwarded by the replace callback; drop placeholders.
      const close = template.indexOf('>', i + 2);
      if (close < 0) out += ch;
      else i = close;
    } else if (next && next >= '0' && next <= '9') {
      let digits = next;
      let cursor = i + 2;
      if (template[cursor] >= '0' && template[cursor] <= '9') {
        digits += template[cursor];
        cursor++;
      }
      const index = Number(digits);
      out += groups[index - 1] ?? '';
      i = cursor - 1;
    } else {
      out += ch;
    }
  }
  return out;
}

function withinDepth(script: TavernRegex, depth: number | undefined): boolean {
  if (depth === undefined) return true;
  if (
    script.minDepth !== null &&
    Number.isFinite(script.minDepth) &&
    depth < Number(script.minDepth)
  ) {
    return false;
  }
  if (
    script.maxDepth !== null &&
    Number.isFinite(script.maxDepth) &&
    depth > Number(script.maxDepth)
  ) {
    return false;
  }
  return true;
}

function shouldRun(script: TavernRegex, ctx: RegexContext): boolean {
  if (script.disabled) return false;
  if (ctx.mode === 'display' && script.promptOnly) return false;
  if (ctx.mode === 'prompt' && script.markdownOnly) return false;
  if (
    ctx.placement !== undefined &&
    script.placement.length > 0 &&
    !script.placement.includes(ctx.placement)
  ) {
    return false;
  }
  if (!withinDepth(script, ctx.depth)) return false;
  return true;
}

export function applyRegexScripts(
  text: string,
  scripts: TavernRegex[] | undefined,
  ctx: RegexContext,
): string {
  if (!text || !scripts?.length) return text;
  let output = text;
  for (const script of scripts) {
    if (!shouldRun(script, ctx)) continue;

    const regex = parseRegex(ctx.macro(script.findRegex));
    if (!regex) continue;
    const replacement = ctx.macro(script.replaceString);
    output = output.replace(regex, (...args: unknown[]) => {
      let match = String(args[0] ?? '');
      // SillyTavern trims these substrings out of the matched text itself.
      for (const trim of script.trimStrings) {
        if (!trim) continue;
        match = match.split(trim).join('');
      }
      const groups = args.slice(1, -2).map((g) => (g === undefined ? '' : String(g)));
      return expandReplacement(replacement, match, groups);
    });
  }
  return output;
}

export function hasDisplayRegex(scripts: TavernRegex[] | undefined): boolean {
  return Boolean(scripts?.some((s) => !s.disabled && !s.promptOnly && s.findRegex.trim()));
}

export function hasPromptRegex(scripts: TavernRegex[] | undefined): boolean {
  return Boolean(scripts?.some((s) => !s.disabled && !s.markdownOnly && s.findRegex.trim()));
}

/**
 * Applies the prompt-side regex pass to an outgoing chat history.
 * `depth` counts backwards from the newest message.
 */
export function applyPromptRegex(
  text: string,
  scripts: TavernRegex[] | undefined,
  macro: (text: string) => string,
  depth = 0,
): string {
  return applyRegexScripts(text, scripts, { macro, mode: 'prompt', depth });
}
