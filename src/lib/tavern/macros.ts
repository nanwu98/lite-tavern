import type { Character, Settings } from '../../types';

export interface MacroContext {
  character?: Character;
  settings: Settings;
  /** Optional chat-variable reader for {{getvar::x}}. */
  getVar?: (path: string) => unknown;
  lastMessage?: string;
  lastMessageId?: number;
  input?: string;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function pick(arr: unknown[]): unknown {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomOf(list: string[]): string {
  return list.length ? String(pick(list) ?? '') : '';
}

function resolveValue(key: string, ctx: MacroContext): string | undefined {
  const character = ctx.character;
  const settings = ctx.settings;
  switch (key) {
    case 'char':
    case 'char_name':
      return character?.name ?? '';
    case 'user':
    case 'user_name':
      return settings.userName || '旅人';
    case 'description':
    case 'char_description':
      return character?.description ?? '';
    case 'personality':
    case 'char_personality':
      return character?.personality ?? '';
    case 'scenario':
      return character?.scenario ?? '';
    case 'persona':
    case 'user_persona':
      return settings.userPersona ?? '';
    case 'mes_example':
    case 'example_dialogue':
      return character?.mesExample ?? '';
    case 'char_version':
      return character?.characterVersion ?? '';
    case 'original':
      return character?.name ?? '';
    case 'model':
      return settings.model ?? '';
    case 'lastmessage':
      return ctx.lastMessage ?? '';
    case 'lastmessageid':
      return ctx.lastMessageId !== undefined ? String(ctx.lastMessageId) : '';
    case 'input':
      return ctx.input ?? '';
    default:
      return undefined;
  }
}

/** Tavern-style {{macro}} substitution shared by prompts, pages and scripts. */
export function substitudeMacros(text: string, ctx: MacroContext): string {
  if (!text || !text.includes('{{')) return text;
  const now = new Date();
  return text.replace(/\{\{([^{}]+)\}\}/g, (whole, raw: string) => {
    const expr = raw.trim();
    const lower = expr.toLowerCase();

    if (expr.startsWith('//')) return '';
    if (expr.startsWith('random:')) {
      const range = expr
        .slice(7)
        .split('-')
        .map((n) => Number(n));
      if (range.length === 2 && range.every((n) => Number.isFinite(n))) {
        const [a, b] = range;
        return String(Math.floor(Math.random() * (Math.abs(b - a) + 1)) + Math.min(a, b));
      }
      return whole;
    }
    if (lower.startsWith('random::')) {
      return randomOf(
        expr
          .slice(8)
          .split('::')
          .map((s) => s.trim()),
      );
    }
    if (lower.startsWith('pick::')) {
      return randomOf(
        expr
          .slice(6)
          .split('::')
          .map((s) => s.trim()),
      );
    }
    if (lower.startsWith('getvar::')) {
      const value = ctx.getVar?.(expr.slice(8).trim());
      if (value === undefined || value === null) return '';
      return typeof value === 'string' ? value : JSON.stringify(value);
    }
    if (lower.startsWith('getglobalvar::')) {
      const value = ctx.getVar?.(`global.${expr.slice(14).trim()}`);
      return value === undefined || value === null ? '' : String(value);
    }
    if (lower === 'time') return now.toLocaleTimeString('zh-CN', { hour12: false });
    if (lower === 'date') return now.toLocaleDateString('zh-CN');
    if (lower === 'weekday') return WEEKDAYS[now.getDay()];
    if (lower === 'isotime') return now.toISOString();
    if (lower === 'datetime') return now.toLocaleString('zh-CN', { hour12: false });
    if (lower === 'newline') return '\n';
    if (lower === 'space') return ' ';

    const direct = resolveValue(lower, ctx);
    if (direct !== undefined) return direct;
    return whole;
  });
}
