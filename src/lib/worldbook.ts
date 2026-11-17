import type { WorldBook, WorldBookEntry, WorldBookSource } from '../types';
import { asBool, asNumber, asString, asStringArray, uid } from './util';

const POSITION_MAP: Record<string, number> = {
  before_char: 0,
  before_character: 0,
  after_char: 1,
  after_character: 1,
  author_note_top: 2,
  an_top: 2,
  author_note_bottom: 3,
  an_bottom: 3,
  at_depth: 4,
  depth: 4,
  example_top: 5,
  em_top: 5,
  example_bottom: 6,
  em_bottom: 6,
};

export function normalizePosition(value: unknown): number {
  if (typeof value === 'string') {
    const mapped = POSITION_MAP[value.trim().toLowerCase()];
    if (mapped !== undefined) return mapped;
    const num = Number(value);
    if (Number.isFinite(num)) return Math.max(0, Math.min(6, Math.trunc(num)));
    return 1;
  }
  const n = asNumber(value, 1);
  return Math.max(0, Math.min(6, Math.trunc(n)));
}

function getRawEntries(input: unknown): unknown {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  const obj = input as Record<string, unknown>;
  const entries = obj.entries;
  if (!entries) return [];
  if (Array.isArray(entries)) return entries;
  if (typeof entries === 'object') {
    const record = entries as Record<string, unknown>;
    // Some exports wrap the actual map one level deeper.
    if (
      !Array.isArray(record) &&
      Object.keys(record).length === 1 &&
      typeof record.entries === 'object' &&
      record.entries
    ) {
      return record.entries;
    }
    return Object.entries(record).map(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { __key: key, ...(value as Record<string, unknown>) };
      }
      return value;
    });
  }
  return [];
}

export function normalizeEntry(raw: unknown, index: number): WorldBookEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const ext =
    e.extensions && typeof e.extensions === 'object'
      ? (e.extensions as Record<string, unknown>)
      : {};

  const keys = asStringArray(e.key ?? e.keys ?? e.keywords);
  const secondaryKeys = asStringArray(e.keysecondary ?? e.secondary_keys ?? e.secondaryKeys);
  const content = asString(e.content ?? e.entry ?? e.text).trim();
  if (!content) return null;

  const position = normalizePosition(e.position ?? ext.position ?? e.injection_position);
  const enabled = e.enabled;
  const disable = e.disable !== undefined ? asBool(e.disable, false) : enabled === false;

  return {
    id: uid(),
    keys,
    secondaryKeys,
    content,
    comment: asString(e.comment ?? e.name ?? e.title).trim() || keys[0] || `词条 ${index + 1}`,
    constant: asBool(e.constant, false),
    selective: asBool(e.selective, false),
    selectiveLogic: asNumber(e.selectiveLogic ?? e.selective_logic, 0),
    order: asNumber(e.order ?? e.insertion_order ?? e.insertionOrder, 100),
    position,
    depth: Math.max(0, asNumber(e.depth, 4)),
    role: asNumber(e.role, 0),
    disable,
    probability: Math.max(0, Math.min(100, asNumber(e.probability, 100))),
    useProbability: asBool(e.useProbability, true),
    caseSensitive: asBool(e.caseSensitive ?? e.case_sensitive, false),
    matchWholeWords: asBool(e.matchWholeWords ?? e.match_whole_words, true),
    scanDepth: Math.max(0, asNumber(e.scanDepth ?? e.scan_depth ?? ext.scan_depth, 2)),
    excludeRecursion: asBool(e.excludeRecursion ?? e.exclude_recursion, false),
    preventRecursion: asBool(e.preventRecursion ?? e.prevent_recursion, false),
    sticky: Math.max(0, asNumber(e.sticky, 0)),
    cooldown: Math.max(0, asNumber(e.cooldown, 0)),
    group: asString(e.group).trim(),
    groupWeight: asNumber(e.groupWeight ?? e.group_weight, 100),
    matchCharacterDescription: asBool(e.matchCharacterDescription, false),
    matchCharacterPersonality: asBool(e.matchCharacterPersonality, false),
    matchScenario: asBool(e.matchScenario, false),
    matchPersonaDescription: asBool(e.matchPersonaDescription, false),
  };
}

export function normalizeEntryArray(input: unknown): WorldBookEntry[] {
  const raw = getRawEntries(input);
  if (!Array.isArray(raw)) {
    if (raw && typeof raw === 'object') {
      return Object.values(raw as Record<string, unknown>)
        .map((value, i) => normalizeEntry(value, i))
        .filter((v): v is WorldBookEntry => Boolean(v));
    }
    return [];
  }
  return raw
    .map((value, i) => normalizeEntry(value, i))
    .filter((v): v is WorldBookEntry => Boolean(v));
}

export function looksLikeWorldBook(input: unknown): boolean {
  if (Array.isArray(input)) {
    return (
      input.length > 0 &&
      input.every((v) => v && typeof v === 'object' && ('content' in v || 'entry' in v))
    );
  }
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  if (obj.entries == null) return false;
  return !('first_mes' in obj) && !('description' in obj) && !('spec' in obj);
}

export function parseWorldBook(
  input: unknown,
  fallbackName = '未命名世界书',
  source: WorldBookSource = 'imported',
  fileName?: string,
): WorldBook {
  if (!input || typeof input !== 'object') throw new Error('世界书格式无效');
  const obj = input as Record<string, unknown>;
  // A card's character_book may be wrapped as { name, entries }.
  const entries = normalizeEntryArray(obj.entries != null ? obj : input);
  if (entries.length === 0) throw new Error('世界书里没有可用的词条');
  return {
    id: uid(),
    name: asString(obj.name ?? obj.bookName).trim() || fallbackName,
    fileName,
    source,
    entries,
    createdAt: Date.now(),
  };
}

export function countEntries(books: WorldBook[]): number {
  return books.reduce((sum, b) => sum + b.entries.length, 0);
}

/** Blank entry used by the in-app world book editor. */
export function createEmptyEntry(index = 0): WorldBookEntry {
  return {
    id: uid(),
    keys: [],
    secondaryKeys: [],
    content: '',
    comment: `词条 ${index + 1}`,
    constant: false,
    selective: false,
    selectiveLogic: 0,
    order: 100,
    position: 1,
    depth: 4,
    role: 0,
    disable: false,
    probability: 100,
    useProbability: true,
    caseSensitive: false,
    matchWholeWords: true,
    scanDepth: 2,
    excludeRecursion: false,
    preventRecursion: false,
    sticky: 0,
    cooldown: 0,
    group: '',
    groupWeight: 100,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchScenario: false,
    matchPersonaDescription: false,
  };
}
