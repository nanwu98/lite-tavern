import type { ImportedCard, WorldBook } from '../types';
import { extractCardJsonFromPng } from './png';
import { blobToDataUrl, shrinkDataUrl } from './image';
import { asString, asStringArray, uid } from './util';
import { looksLikeWorldBook, parseWorldBook } from './worldbook';
import { extractCardCode } from './tavern/parse';

export interface ParsedCard extends ImportedCard {
  avatarDataUrl?: string;
}

export type ImportResult =
  | { kind: 'card'; card: ParsedCard; fileName: string }
  | { kind: 'worldbook'; book: WorldBook; fileName: string };

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function normalizeAvatar(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const v = raw.trim();
  if (v === 'none' || v === 'null') return undefined;
  if (/^data:image\//i.test(v)) return v;
  if (/^https?:\/\//i.test(v)) return undefined;
  if (v.length > 200 && /^[a-z0-9+/=\s]+$/i.test(v)) {
    return `data:image/png;base64,${v.replace(/\s+/g, '')}`;
  }
  return undefined;
}

function extractWorldName(
  data: Record<string, unknown>,
  top: Record<string, unknown>,
): string | undefined {
  const ext = [data.extensions, top.extensions].find(
    (v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v),
  );
  const world = ext?.world ?? top.world;
  if (typeof world === 'string' && world.trim()) return world.trim().replace(/\.json$/i, '');
  if (world && typeof world === 'object') {
    const name = (world as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) return name.trim().replace(/\.json$/i, '');
  }
  return undefined;
}

function isCardLike(obj: Record<string, unknown>): boolean {
  return Boolean(
    obj.spec ||
    obj.name ||
    obj.char_name ||
    obj.first_mes ||
    obj.char_greeting ||
    obj.description ||
    obj.char_persona,
  );
}

export function parseCardObject(
  input: unknown,
  fileName?: string,
  avatarDataUrl?: string,
): ParsedCard {
  if (!input || typeof input !== 'object') throw new Error('角色卡 JSON 格式无效');
  let obj = input as Record<string, unknown>;
  if (Array.isArray(input)) {
    if (input.length === 0) throw new Error('角色卡数组为空');
    obj = input[0] as Record<string, unknown>;
  }
  if (Array.isArray(obj.characters) && obj.characters.length > 0) {
    obj = obj.characters[0] as Record<string, unknown>;
  }
  if (!isCardLike(obj)) {
    throw new Error('认不出这张角色卡：缺少 name / first_mes 等字段');
  }

  const nested =
    obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : {};
  const data = Object.keys(nested).length ? nested : obj;
  const top = obj;

  const name = asString(
    pick(data, 'name', 'char_name', 'character_name') ?? pick(top, 'name', 'char_name'),
  ).trim();
  if (!name) throw new Error('角色卡缺少角色名');

  const firstMes = asString(
    pick(data, 'first_mes', 'char_greeting', 'greeting') ??
      pick(top, 'first_mes', 'char_greeting', 'greeting'),
  ).trim();
  const alternateGreetings = asStringArray(
    pick(data, 'alternate_greetings') ?? pick(top, 'alternate_greetings'),
  );
  const worldName = extractWorldName(data, top);

  const rawBook = pick(data, 'character_book') ?? pick(top, 'character_book');
  const books: ParsedCard['books'] = [];
  if (rawBook && typeof rawBook === 'object') {
    const rawObj = rawBook as Record<string, unknown>;
    const hasEntries =
      rawObj.entries != null &&
      (Array.isArray(rawObj.entries) || Object.keys(rawObj.entries as object).length > 0);
    if (hasEntries) {
      try {
        const book = parseWorldBook(
          rawBook,
          asString(rawObj.name).trim() || worldName || `${name} 的世界书`,
          'embedded',
        );
        books.push({ name: book.name, entries: book.entries, source: 'embedded' });
      } catch {
        // A broken embedded book should not prevent the card from importing.
      }
    }
  }

  const avatar = avatarDataUrl ?? normalizeAvatar(pick(data, 'avatar') ?? pick(top, 'avatar'));

  const character: ParsedCard['character'] = {
    id: uid(),
    name,
    description: asString(
      pick(data, 'description', 'char_persona', 'persona') ?? pick(top, 'description'),
    ).trim(),
    personality: asString(pick(data, 'personality') ?? pick(top, 'personality')).trim(),
    scenario: asString(pick(data, 'scenario', 'world_scenario') ?? pick(top, 'scenario')).trim(),
    firstMes,
    mesExample: asString(
      pick(data, 'mes_example', 'example_dialogue') ?? pick(top, 'mes_example', 'example_dialogue'),
    ).trim(),
    systemPrompt: asString(pick(data, 'system_prompt') ?? pick(top, 'system_prompt')).trim(),
    postHistoryInstructions: asString(
      pick(data, 'post_history_instructions') ?? pick(top, 'post_history_instructions'),
    ).trim(),
    alternateGreetings,
    avatar,
    tags: asStringArray(pick(data, 'tags') ?? pick(top, 'tags')),
    notes: asString(
      pick(data, 'creator_notes', 'creator_notes_multilingual') ??
        pick(top, 'creatorcomment', 'creator_notes'),
    ).trim(),
    creator: asString(pick(data, 'creator') ?? pick(top, 'creator')).trim(),
    characterVersion: asString(
      pick(data, 'character_version') ?? pick(top, 'character_version'),
    ).trim(),
    worldBookIds: [],
    worldName,
    code: extractCardCode(pick(data, 'extensions') ?? pick(top, 'extensions')) ?? undefined,
    sourceFileName: fileName,
  };

  return { character, books, avatarDataUrl: avatar };
}

export function normalizeCardForStore(card: ParsedCard): ImportedCard {
  return { character: card.character, books: card.books };
}

async function parseCardFromJson(obj: unknown, fileName: string): Promise<ImportResult> {
  if (looksLikeWorldBook(obj)) {
    const name = fileName.replace(/\.json$/i, '');
    const book = parseWorldBook(obj, name, 'imported', fileName);
    return { kind: 'worldbook', book, fileName };
  }
  const card = parseCardObject(obj, fileName);
  if (card.avatarDataUrl) card.avatarDataUrl = await shrinkDataUrl(card.avatarDataUrl);
  card.character.avatar = card.avatarDataUrl;
  return { kind: 'card', card, fileName };
}

export async function importFile(file: File): Promise<ImportResult> {
  const fileName = file.name || 'import';
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isPng =
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;

  if (isPng || /\.png$/i.test(fileName) || file.type === 'image/png') {
    const obj = await extractCardJsonFromPng(buffer);
    const card = parseCardObject(obj, fileName);
    card.avatarDataUrl = await shrinkDataUrl(await blobToDataUrl(file));
    card.character.avatar = card.avatarDataUrl;
    return { kind: 'card', card, fileName };
  }

  const text = new TextDecoder('utf-8').decode(buffer);
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('文件既不是 PNG 角色卡，也不是有效的 JSON');
  }
  return parseCardFromJson(obj, fileName);
}
