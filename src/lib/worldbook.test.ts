import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { looksLikeWorldBook, normalizeEntryArray, parseWorldBook } from './worldbook';

const worldJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/worldbook.json'), 'utf8'),
);

describe('world book normalization', () => {
  it('normalizes an object-keyed SillyTavern world book', () => {
    expect(looksLikeWorldBook(worldJson)).toBe(true);
    const book = parseWorldBook(worldJson, '测试世界书');
    expect(book.name).toBe('测试世界书');
    expect(book.entries).toHaveLength(2);
    expect(book.entries[0].keys).toEqual(['海边', '海雾']);
    expect(book.entries[1].constant).toBe(true);
  });

  it('normalizes v3 character_book entries (array + keys/position)', () => {
    const entries = normalizeEntryArray({
      entries: [
        {
          id: 1,
          keys: ['钟楼'],
          secondary_keys: ['夜晚'],
          content: '钟楼内容',
          enabled: true,
          insertion_order: 30,
          position: 'before_char',
          case_sensitive: true,
          name: '钟楼',
        },
        {
          keys: [],
          content: '常驻',
          constant: true,
          position: 'after_char',
          enabled: false,
        },
      ],
    });
    expect(entries).toHaveLength(2);
    expect(entries[0].keys).toEqual(['钟楼']);
    expect(entries[0].secondaryKeys).toEqual(['夜晚']);
    expect(entries[0].position).toBe(0);
    expect(entries[0].order).toBe(30);
    expect(entries[0].caseSensitive).toBe(true);
    expect(entries[0].comment).toBe('钟楼');
    expect(entries[1].disable).toBe(true);
    expect(entries[1].position).toBe(1);
  });

  it('throws for empty books', () => {
    expect(() => parseWorldBook({ entries: {} })).toThrow();
  });
});
