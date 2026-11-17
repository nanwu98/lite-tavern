import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCardObject } from './card';
import { extractCardJsonFromPng } from './png';

const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'tests/fixtures', name));
const cardJson = JSON.parse(fixture('card.json').toString('utf8'));

describe('character card parsing', () => {
  it('parses a v3 JSON card and its embedded world book', () => {
    const card = parseCardObject(cardJson, 'card.json');
    expect(card.character.name).toBe('测试角色·阿绫');
    expect(card.character.worldName).toBe('测试世界书');
    expect(card.character.firstMes).toContain('钟楼');
    expect(card.character.alternateGreetings).toHaveLength(1);
    expect(card.books).toHaveLength(1);
    expect(card.books[0].entries).toHaveLength(3);
    expect(card.books[0].entries[1].keys).toEqual(['钟楼', '钟声']);
    expect(card.books[0].entries[0].constant).toBe(true);
  });

  it('extracts chara data from PNG tEXt chunks', async () => {
    const bytes = fixture('card.png');
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const raw = (await extractCardJsonFromPng(buffer)) as Record<string, unknown>;
    expect(raw.name).toBe('测试角色·阿绫');
    const card = parseCardObject(raw, 'card.png');
    expect(card.character.description).toContain('守夜人');
  });

  it('parses legacy v1 flat cards and <START> examples', () => {
    const card = parseCardObject({
      name: '老卡',
      description: '旧格式角色',
      first_mes: '你好',
      mes_example: '<START>\n{{user}}: 嗨\n{{char}}: 嗯。',
      personality: '安静',
    });
    expect(card.character.name).toBe('老卡');
    expect(card.character.mesExample).toContain('<START>');
    expect(card.books).toHaveLength(0);
  });

  it('rejects objects that are clearly not cards', () => {
    expect(() => parseCardObject({ entries: [] })).toThrow();
  });
});
