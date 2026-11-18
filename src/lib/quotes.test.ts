// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findQuoteSpans, highlightQuotedHtml, highlightQuotedText } from './quotes';

describe('quote spans', () => {
  it('finds the six pairs SillyTavern highlights', () => {
    const pairs = [
      '"English"',
      '“弯引号”',
      '«guillemets»',
      '「角括号」',
      '『白角括号』',
      '＂全角引号＂',
    ];
    for (const pair of pairs) {
      expect(findQuoteSpans(pair), pair).toEqual([{ start: 0, end: pair.length }]);
    }
  });

  it('keeps the text before and after a quoted span', () => {
    const line = '她低声说：「跟紧我。」然后转身';
    expect(findQuoteSpans(line)).toEqual([{ start: 5, end: line.indexOf('」') + 1 }]);
  });

  it('does not let an unmatched quote swallow the next pair', () => {
    const line = 'He said "oops and “fine”';
    expect(findQuoteSpans(line)).toEqual([{ start: line.indexOf('“'), end: line.length }]);
  });

  it('never matches across a line break', () => {
    expect(findQuoteSpans('“第一行\n第二行”')).toEqual([]);
  });

  it('returns nothing when there is no closing mark', () => {
    expect(findQuoteSpans('“没有结尾')).toEqual([]);
  });
});

describe('quoted HTML highlighting', () => {
  it('wraps quoted text in a .quote span', () => {
    expect(highlightQuotedHtml('<p>「跟紧我」</p>')).toBe(
      '<p><span class="quote">「跟紧我」</span></p>',
    );
  });

  it('leaves code and preformatted text alone', () => {
    const html = '<p><code>"const x = 1"</code></p><pre>「代码」</pre>';
    expect(highlightQuotedHtml(html)).toBe(html);
  });

  it('does not touch attribute values', () => {
    const out = highlightQuotedHtml('<a href="https://x.test" title="「提示」">「链接」</a>');
    expect(out).toContain('href="https://x.test"');
    expect(out).toContain('title="「提示」"');
    expect(out).toContain('<span class="quote">「链接」</span>');
    expect(out.match(/class="quote"/g)).toHaveLength(1);
  });

  it('escapes user text before wrapping quotes', () => {
    const out = highlightQuotedText('<b>“危险”</b>');
    expect(out).toBe('&lt;b&gt;<span class="quote">“危险”</span>&lt;/b&gt;');
  });

  it('keeps plain text without quotes byte for byte', () => {
    expect(highlightQuotedText('没有引号的一句话')).toBe('没有引号的一句话');
  });
});
