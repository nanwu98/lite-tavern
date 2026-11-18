/**
 * Highlights the text between quotation marks, mirroring SillyTavern's rule.
 *
 * SillyTavern wraps quoted spans in a `<q>` element before markdown
 * (`public/script.js`, messageFormatting) and colours it with
 * `--SmartThemeQuoteColor` (`public/style.css`, `.mes_text q`). Its regex skips
 * `<style>`, fenced code and inline code, and only matches inside one line.
 *
 * Here the same job is done on the rendered HTML instead: markdown (and the
 * sanitizer) run first, then every text node outside code is split and wrapped
 * in `<span class="quote">`. Doing it after rendering means quotes inside tag
 * attributes, code blocks or front-end HTML never get touched, at the cost of
 * not matching a quote whose text is interrupted by inline markup (`「a *b*」`
 * still matches when the emphasis starts and ends inside the quote).
 */

/** The six quote pairs SillyTavern recognises, closing mark second. */
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'], // English double quotes
  ['\u201c', '\u201d'], // “ ”
  ['\u00ab', '\u00bb'], // « »
  ['\u300c', '\u300d'], // 「 」
  ['\u300e', '\u300f'], // 『 』
  ['\uff02', '\uff02'], // ＂ ＂
];

const QUOTE_CHARS = new Set(QUOTE_PAIRS.flatMap(([open, close]) => [open, close]));

/** Elements whose text is code and must stay untouched. */
const CODE_SELECTOR = 'code, pre, kbd, samp, script, style, textarea';

export const QUOTE_CLASS = 'quote';

export interface QuoteSpan {
  /** Index of the opening mark. */
  start: number;
  /** Index just past the closing mark. */
  end: number;
}

/**
 * Finds non-overlapping quoted spans in one line, left to right.
 *
 * An opening mark without a closing partner on the same line is ignored (an
 * apostrophe or a lone bracket cannot swallow the rest of the message). This is
 * the same behaviour as SillyTavern's `(".*?")|(“.*?”)|…` pattern, where `.`
 * does not cross a newline.
 */
export function findQuoteSpans(text: string): QuoteSpan[] {
  const spans: QuoteSpan[] = [];
  let lineStart = 0;
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    let cursor = lineStart;
    while (cursor < lineEnd) {
      let start = -1;
      let close = '';
      for (const [open, end] of QUOTE_PAIRS) {
        const at = text.indexOf(open, cursor);
        if (at === -1 || at >= lineEnd) continue;
        if (start === -1 || at < start) {
          start = at;
          close = end;
        }
      }
      if (start === -1) break;
      const end = text.indexOf(close, start + 1);
      if (end === -1 || end >= lineEnd) {
        // Skip the lone opening mark and keep looking, so `"a “b”` still finds
        // the curly pair after the unmatched straight quote.
        cursor = start + 1;
        continue;
      }
      spans.push({ start, end: end + 1 });
      cursor = end + 1;
    }
    lineStart = lineEnd + 1;
  }
  return spans;
}

/** True when the text contains at least one of the recognised quote marks. */
export function hasQuoteMark(text: string): boolean {
  for (const char of text) if (QUOTE_CHARS.has(char)) return true;
  return false;
}

function splitTextNode(node: Text): void {
  const text = node.nodeValue ?? '';
  const spans = findQuoteSpans(text);
  if (!spans.length) return;
  const doc = node.ownerDocument;
  if (!doc) return;
  const fragment = doc.createDocumentFragment();
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      fragment.appendChild(doc.createTextNode(text.slice(cursor, span.start)));
    }
    const mark = doc.createElement('span');
    mark.className = QUOTE_CLASS;
    mark.textContent = text.slice(span.start, span.end);
    fragment.appendChild(mark);
    cursor = span.end;
  }
  if (cursor < text.length) {
    fragment.appendChild(doc.createTextNode(text.slice(cursor)));
  }
  node.replaceWith(fragment);
}

function highlightNode(root: Node): void {
  const doc = root.ownerDocument;
  if (!doc?.createTreeWalker) return;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(CODE_SELECTOR)) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`.${QUOTE_CLASS}`)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) splitTextNode(node);
}

/**
 * Wraps quoted spans in HTML with `<span class="quote">`.
 *
 * Used on markdown output (assistant messages) and on escaped plain text (user
 * messages). Input is assumed to be already safe HTML: user text must go
 * through {@link highlightQuotedText}, which escapes it first.
 */
export function highlightQuotedHtml(html: string): string {
  if (!html || !hasQuoteMark(html)) return html;
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<div data-quote-root>${html}</div>`, 'text/html');
  const root = doc.querySelector('[data-quote-root]');
  if (!root) return html;
  highlightNode(root);
  return root.innerHTML;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escapes plain text and highlights quoted spans. Newlines are kept as-is: the
 * user bubble renders them with `white-space: pre-wrap`.
 */
export function highlightQuotedText(text: string): string {
  return highlightQuotedHtml(escapeHtml(text));
}
