import { describe, expect, it } from 'vitest';
import { paginate } from './pagination';

describe('paginate', () => {
  it('keeps an empty list on page 1/1', () => {
    expect(paginate([], 0, 8)).toEqual({ page: 0, pageCount: 1, items: [] });
  });

  it('slices into pages of the requested size', () => {
    const items = Array.from({ length: 17 }, (_, i) => i);
    expect(paginate(items, 0, 8).items).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(paginate(items, 1, 8).items).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(paginate(items, 2, 8).items).toEqual([16]);
    expect(paginate(items, 0, 8).pageCount).toBe(3);
  });

  it('clamps an out-of-range page instead of showing an empty page', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(paginate(items, 9, 8).page).toBe(1);
    expect(paginate(items, 9, 8).items).toEqual([8, 9]);
    expect(paginate(items, -3, 8).page).toBe(0);
  });

  it('treats an exact multiple of the page size as whole pages', () => {
    const items = Array.from({ length: 16 }, (_, i) => i);
    expect(paginate(items, 0, 8).pageCount).toBe(2);
    expect(paginate(items, 1, 8).items).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });
});
