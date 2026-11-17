import { describe, expect, it } from 'vitest';
import { applyRegexScripts, parseRegex } from './regex';
import { extractCardCode } from './parse';
import { splitMessageContent, isFrontendHtml } from './render';
import { substitudeMacros } from './macros';
import { DEFAULT_SETTINGS } from '../../defaults';

const macro = (text: string) => text;

function regexScript(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r1',
    scriptName: 'test',
    findRegex: '/<tag>(.*?)<\\/tag>/gs',
    replaceString: '[$1]',
    trimStrings: [],
    placement: [2],
    disabled: false,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    ...overrides,
  };
}

describe('tavern regex scripts', () => {
  it('parses slash-style and plain regex sources', () => {
    expect(parseRegex('/abc/gi')?.flags).toBe('gi');
    expect(parseRegex('a+b')?.test('aab')).toBe(true);
    expect(parseRegex('/[/')).toBeNull();
  });

  it('applies capture groups and honours placement', () => {
    const scripts = [regexScript()];
    const applied = applyRegexScripts('a<tag>hi</tag>b', scripts, {
      macro,
      mode: 'display',
      placement: 2,
    });
    expect(applied).toBe('a[hi]b');
    const skipped = applyRegexScripts('a<tag>hi</tag>b', scripts, {
      macro,
      mode: 'display',
      placement: 1,
    });
    expect(skipped).toBe('a<tag>hi</tag>b');
  });

  it('trims characters out of the matched text (SillyTavern behaviour)', () => {
    const scripts = [regexScript({ trimStrings: ['>', '<'], replaceString: '[$&]' })];
    expect(
      applyRegexScripts('<tag>a>b</tag>', scripts, { macro, mode: 'display', placement: 2 }),
    ).toBe('[tagab/tag]');
  });

  it('separates display-only and prompt-only passes', () => {
    const displayOnly = [regexScript({ markdownOnly: true })];
    const promptOnly = [regexScript({ promptOnly: true, replaceString: 'P' })];
    expect(applyRegexScripts('<tag>x</tag>', displayOnly, { macro, mode: 'display' })).toBe('[x]');
    expect(applyRegexScripts('<tag>x</tag>', displayOnly, { macro, mode: 'prompt' })).toBe(
      '<tag>x</tag>',
    );
    expect(applyRegexScripts('<tag>x</tag>', promptOnly, { macro, mode: 'prompt' })).toBe('P');
    expect(applyRegexScripts('<tag>x</tag>', promptOnly, { macro, mode: 'display' })).toBe(
      '<tag>x</tag>',
    );
  });

  it('respects min/max depth', () => {
    const scripts = [regexScript({ maxDepth: 2 })];
    expect(applyRegexScripts('<tag>x</tag>', scripts, { macro, mode: 'display', depth: 1 })).toBe(
      '[x]',
    );
    expect(applyRegexScripts('<tag>x</tag>', scripts, { macro, mode: 'display', depth: 3 })).toBe(
      '<tag>x</tag>',
    );
  });
});

describe('card code extraction', () => {
  it('reads tavern_helper scripts and regex scripts out of extensions', () => {
    const code = extractCardCode({
      tavern_helper: {
        scripts: [
          {
            id: 'a',
            name: 'A',
            content: 'console.log(1)',
            enabled: true,
            button: { enabled: true, buttons: [{ name: '打开', visible: true }] },
          },
          { id: 'b', name: 'B', content: '   ', enabled: true },
        ],
      },
      regex_scripts: [
        {
          scriptName: 'R',
          findRegex: '/a/g',
          replaceString: 'b',
          placement: [2],
          markdownOnly: true,
        },
      ],
      depth_prompt: { prompt: '深度提示', depth: 2 },
    });
    expect(code?.scripts).toHaveLength(1);
    expect(code?.scripts[0].button?.buttons[0].name).toBe('打开');
    expect(code?.regexScripts).toHaveLength(1);
    expect(code?.regexScripts[0].findRegex).toBe('/a/g');
    expect(code?.depthPrompt).toBe('深度提示');
  });

  it('returns null for cards without code', () => {
    expect(extractCardCode({})).toBeNull();
    expect(extractCardCode({ talkativeness: '0.5' })).toBeNull();
  });
});

describe('front-end message splitting', () => {
  it('detects full-page html blocks', () => {
    expect(isFrontendHtml('<head><style>x</style></head><body><div id="app"></div></body>')).toBe(
      true,
    );
    expect(isFrontendHtml('<div class="card">hi</div>')).toBe(false);
  });

  it('splits a message into markdown and renderable pages', () => {
    const content =
      '开场白\n\n```html\n<head></head><body><div id="app"></div></body>\n```\n\n结束';
    const segments = splitMessageContent(content);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ kind: 'markdown', text: '开场白\n\n' });
    expect(segments[1].kind).toBe('frontend');
    expect(segments[2].kind).toBe('markdown');
  });

  it('keeps ordinary code blocks as markdown', () => {
    const segments = splitMessageContent('```js\nconsole.log(1)\n```');
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('markdown');
  });
});

describe('macros', () => {
  const character = {
    id: 'c',
    name: '阿绫',
    description: '守夜人',
    personality: '安静',
    scenario: '钟楼',
    firstMes: '',
    mesExample: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    alternateGreetings: [],
    tags: [],
    creator: '',
    characterVersion: '1.0',
    worldBookIds: [],
    createdAt: 0,
    updatedAt: 0,
  };

  it('substitutes characters, persona and variables', () => {
    const out = substitudeMacros('{{char}} / {{user}} / {{getvar::hp}}', {
      character,
      settings: { ...DEFAULT_SETTINGS, userName: '旅人' },
      getVar: (path) => (path === 'hp' ? 42 : undefined),
    });
    expect(out).toBe('阿绫 / 旅人 / 42');
  });

  it('leaves unknown macros untouched', () => {
    expect(substitudeMacros('{{unknown_thing}}', { settings: DEFAULT_SETTINGS })).toBe(
      '{{unknown_thing}}',
    );
  });
});
