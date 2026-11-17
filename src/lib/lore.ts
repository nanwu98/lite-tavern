import type { Character, ChatMessage, Settings, WorldBook, WorldBookEntry } from '../types';

export interface ActiveEntry {
  entry: WorldBookEntry;
  bookId: string;
  bookName: string;
  reason: 'constant' | 'keyword' | 'recursion';
}

export interface ActivationInput {
  books: WorldBook[];
  messages: ChatMessage[];
  character: Character;
  settings: Settings;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAsciiWord(s: string): boolean {
  return /^[\x20-\x7e]+$/.test(s) && /[a-z0-9]/i.test(s);
}

/** Compiles a SillyTavern-style key: `/regex/flags` or a literal. */
export function makeMatcher(
  key: string,
  caseSensitive: boolean,
  wholeWords: boolean,
): (text: string) => boolean {
  const trimmed = key.trim();
  if (!trimmed) return () => false;

  const regexMatch = trimmed.match(/^\/(.+)\/([a-z]*)$/s);
  if (regexMatch) {
    const flags = new Set(regexMatch[2].split(''));
    if (!caseSensitive) flags.add('i');
    try {
      const re = new RegExp(regexMatch[1], [...flags].join(''));
      return (text: string) => re.test(text);
    } catch {
      // Fall through to literal matching for invalid regexes.
    }
  }

  if (caseSensitive) {
    if (wholeWords && isAsciiWord(trimmed)) {
      const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(trimmed)}(?![A-Za-z0-9_])`);
      return (text: string) => re.test(text);
    }
    return (text: string) => text.includes(trimmed);
  }

  const needle = trimmed.toLocaleLowerCase();
  if (wholeWords && isAsciiWord(trimmed)) {
    const re = new RegExp(`(?<![a-z0-9_])${escapeRegExp(needle)}(?![a-z0-9_])`, 'i');
    return (text: string) => re.test(text);
  }
  return (text: string) => text.toLocaleLowerCase().includes(needle);
}

export function matchesAny(
  text: string,
  keys: string[],
  caseSensitive: boolean,
  wholeWords: boolean,
): boolean {
  if (!text) return false;
  return keys.some((key) => makeMatcher(key, caseSensitive, wholeWords)(text));
}

function secondaryMatches(text: string, entry: WorldBookEntry): boolean {
  const secondary = entry.secondaryKeys;
  if (!entry.selective || secondary.length === 0) return true;
  const matched = secondary.map((key) =>
    makeMatcher(key, entry.caseSensitive, entry.matchWholeWords)(text),
  );
  switch (entry.selectiveLogic) {
    case 0:
      return matched.some(Boolean);
    case 1:
      return !matched.every(Boolean);
    case 2:
      return !matched.some(Boolean);
    case 3:
      return matched.every(Boolean);
    default:
      return matched.some(Boolean);
  }
}

function messageWindow(messages: ChatMessage[], depth: number): string {
  const usable = messages.filter((m) => m.content.trim() && m.status !== 'error');
  if (depth <= 0) return '';
  return usable
    .slice(-depth)
    .map((m) => m.content)
    .join('\n');
}

function characterScanText(
  character: Character,
  entry: WorldBookEntry,
  settings: Settings,
): string {
  const parts: string[] = [];
  if (entry.matchCharacterDescription) parts.push(character.description);
  if (entry.matchCharacterPersonality) parts.push(character.personality);
  if (entry.matchScenario) parts.push(character.scenario);
  if (entry.matchPersonaDescription) parts.push(settings.userPersona);
  return parts.filter(Boolean).join('\n');
}

function groupFilter(active: ActiveEntry[]): ActiveEntry[] {
  const byGroup = new Map<string, ActiveEntry[]>();
  const result: ActiveEntry[] = [];
  for (const item of active) {
    const group = item.entry.group.trim();
    if (!group || item.entry.constant) {
      result.push(item);
      continue;
    }
    const list = byGroup.get(group) ?? [];
    list.push(item);
    byGroup.set(group, list);
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => {
      const weight = b.entry.groupWeight - a.entry.groupWeight;
      return weight !== 0 ? weight : b.entry.order - a.entry.order;
    });
    result.push(list[0]);
  }
  return result;
}

export function activateLore(input: ActivationInput): ActiveEntry[] {
  const { books, messages, character, settings } = input;
  const active: ActiveEntry[] = [];
  const activeIds = new Set<string>();
  const windows = new Map<number, string>();

  const windowFor = (depth: number): string => {
    if (!windows.has(depth)) windows.set(depth, messageWindow(messages, depth));
    return windows.get(depth) ?? '';
  };

  const consider = (
    book: WorldBook,
    entry: WorldBookEntry,
    reason: ActiveEntry['reason'],
    useProbability: boolean,
  ): boolean => {
    if (activeIds.has(entry.id) || entry.disable || !entry.content.trim()) return false;
    if (useProbability && entry.useProbability && entry.probability < 100) {
      if (Math.random() * 100 >= entry.probability) return false;
    }
    activeIds.add(entry.id);
    active.push({ entry, bookId: book.id, bookName: book.name, reason });
    return true;
  };

  for (const book of books) {
    for (const entry of book.entries) {
      if (entry.disable) continue;
      if (entry.constant) {
        consider(book, entry, 'constant', true);
        continue;
      }
      if (entry.keys.length === 0) continue;

      const scanText = [windowFor(entry.scanDepth), characterScanText(character, entry, settings)]
        .filter(Boolean)
        .join('\n');
      if (!matchesAny(scanText, entry.keys, entry.caseSensitive, entry.matchWholeWords)) continue;
      if (!secondaryMatches(scanText, entry)) continue;
      consider(book, entry, 'keyword', true);
    }
  }

  // Recursive activation: lore can mention another entry's key.
  const allEntries = books.flatMap((book) => book.entries.map((entry) => ({ book, entry })));
  for (let pass = 0; pass < 3; pass++) {
    const sourceText = active
      .filter((item) => !item.entry.preventRecursion)
      .map((item) => item.entry.content)
      .join('\n');
    if (!sourceText) break;
    let added = false;
    for (const { book, entry } of allEntries) {
      if (activeIds.has(entry.id) || entry.disable || entry.constant || entry.keys.length === 0)
        continue;
      if (entry.excludeRecursion) continue;
      if (!matchesAny(sourceText, entry.keys, entry.caseSensitive, entry.matchWholeWords)) continue;
      if (!secondaryMatches(sourceText, entry)) continue;
      if (consider(book, entry, 'recursion', true)) added = true;
    }
    if (!added) break;
  }

  return groupFilter(active);
}

export function activeTitles(active: ActiveEntry[]): string[] {
  return active.map((item) => item.entry.comment || item.entry.keys[0] || item.bookName);
}

export function activeForPrompt(active: ActiveEntry[]): {
  before: ActiveEntry[];
  after: ActiveEntry[];
  authorNote: ActiveEntry[];
  example: ActiveEntry[];
  atDepth: ActiveEntry[];
} {
  const sortByOrder = (a: ActiveEntry, b: ActiveEntry) => a.entry.order - b.entry.order;
  return {
    before: active.filter((a) => a.entry.position === 0).sort(sortByOrder),
    after: active.filter((a) => a.entry.position === 1).sort(sortByOrder),
    authorNote: active
      .filter((a) => a.entry.position === 2 || a.entry.position === 3)
      .sort(sortByOrder),
    example: active
      .filter((a) => a.entry.position === 5 || a.entry.position === 6)
      .sort(sortByOrder),
    atDepth: active.filter((a) => a.entry.position === 4),
  };
}
