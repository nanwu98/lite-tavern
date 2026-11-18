export interface PageSlice<T> {
  /** Clamped zero-based page. */
  page: number;
  pageCount: number;
  items: T[];
}

/**
 * Slices a list into pages and clamps the requested page into range.
 *
 * Shared by the start screen and the card rail so deleting the last card of the
 * final page can never leave an empty page behind.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(pageCount - 1, Math.max(0, Math.floor(page) || 0));
  return {
    page: safePage,
    pageCount,
    items: items.slice(safePage * size, (safePage + 1) * size),
  };
}
