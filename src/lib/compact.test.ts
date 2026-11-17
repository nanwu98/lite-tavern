import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../defaults';
import { parseCardObject } from './card';
import {
  buildSummaryMessages,
  chunkMessages,
  planCompaction,
  renderTranscript,
  summaryWordTarget,
} from './compact';
import { buildPrompt } from './prompt';
import { estimateMessagesTokens, estimateTokens, formatTokenCount } from './tokens';
import type { ChatMessage } from '../types';

const cardJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/card.json'), 'utf8'),
);
const parsed = parseCardObject(cardJson);
const character = { ...parsed.character, createdAt: 0, updatedAt: 0 };

function msg(role: ChatMessage['role'], content: string, id = String(Math.random())): ChatMessage {
  return { id, role, content, createdAt: 0 };
}

describe('token estimates', () => {
  it('counts CJK heavier than latin text', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('钟楼')).toBe(2);
    expect(estimateTokens('abcdefghij')).toBeLessThan(estimateTokens('十个中文字符啊啊啊啊'));
  });

  it('adds per-message overhead to a request estimate', () => {
    const one = estimateMessagesTokens([{ role: 'user', content: '你好' }]);
    const two = estimateMessagesTokens([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好' },
    ]);
    expect(one).toBeGreaterThanOrEqual(estimateTokens('你好') + 4);
    expect(two).toBeGreaterThan(one);
  });

  it('formats big numbers for the UI', () => {
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(12_345)).toBe('12.3k');
    expect(formatTokenCount(128_000)).toBe('128k');
  });
});

describe('compaction planning', () => {
  it('needs at least two messages beyond the kept tail', () => {
    expect(planCompaction(9, 0, 8)).toBeNull();
    expect(planCompaction(10, 0, 8)).toEqual({ from: 0, to: 2, count: 2 });
  });

  it('continues after a previous summary instead of re-summarizing it', () => {
    expect(planCompaction(30, 20, 8)).toEqual({ from: 20, to: 22, count: 2 });
    // A chat that only grew by a couple of messages has nothing new to fold.
    expect(planCompaction(24, 20, 8)).toBeNull();
  });

  it('never points past the usable message list', () => {
    const plan = planCompaction(12, 99, 4);
    expect(plan).toBeNull();
    expect(planCompaction(30, 25, 2)).toEqual({ from: 25, to: 28, count: 3 });
  });
});

describe('summarizer request', () => {
  const settings = { ...DEFAULT_SETTINGS, userName: '旅人' };

  it('splits a long transcript into budget-sized chunks', () => {
    const messages = Array.from({ length: 20 }, (_, i) => msg('user', 'x'.repeat(400), `m${i}`));
    const chunks = chunkMessages(messages, 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toHaveLength(20);
    for (const chunk of chunks) {
      const tokens = chunk.reduce((sum, m) => sum + estimateTokens(m.content) + 8, 0);
      expect(tokens).toBeLessThanOrEqual(500 + 408);
    }
  });

  it('renders speakers and merges previous memory into the request', () => {
    const transcript = renderTranscript(
      [msg('assistant', '今晚的钟慢了。'), msg('user', '带我去看看。')],
      character,
      settings,
    );
    expect(transcript).toContain(`${character.name}：今晚的钟慢了。`);
    expect(transcript).toContain('旅人：带我去看看。');

    const [system, user] = buildSummaryMessages('旧记忆：钥匙在阿绫手里。', transcript);
    expect(system.role).toBe('system');
    expect(system.content).toContain('记忆压缩器');
    expect(system.content).not.toContain('{{words}}');
    expect(user.content).toContain('【已有记忆】');
    expect(user.content).toContain('钥匙在阿绫手里');
    expect(user.content).toContain('【需要合并的新增对话】');

    const [noPrevSystem, noPrevUser] = buildSummaryMessages('', transcript);
    expect(noPrevSystem.content).toContain('记忆压缩器');
    expect(noPrevUser.content).not.toContain('【已有记忆】');
    expect(noPrevUser.content).toContain('【需要压缩的对话】');
  });

  it('scales the target length with the source', () => {
    expect(summaryWordTarget('短')).toBe(260);
    expect(summaryWordTarget('中'.repeat(4000))).toBe(500);
    expect(summaryWordTarget('长'.repeat(40_000))).toBe(1200);
  });
});

describe('prompt with a compaction', () => {
  it('replaces covered messages with a story_memory block', () => {
    const messages = [
      msg('assistant', '开场：钟楼在雨里。', 'g'),
      msg('user', '我想上去。', 'u1'),
      msg('assistant', '那就跟紧我。', 'a1'),
      msg('user', '好。', 'u2'),
    ];
    const compaction = {
      summary: '两人已经在钟楼下会合。',
      throughIndex: 2,
      updatedAt: 0,
      savedTokens: 100,
    };
    const prompt = buildPrompt(character, [], messages, DEFAULT_SETTINGS, compaction);
    const contents = prompt.messages.map((m) => m.content);
    expect(contents.some((text) => text.includes('<story_memory>'))).toBe(true);
    expect(contents.some((text) => text.includes('两人已经在钟楼下会合'))).toBe(true);
    // Covered messages are gone, the recent tail is still verbatim.
    expect(contents).not.toContain('开场：钟楼在雨里。');
    expect(contents).toContain('那就跟紧我。');
    expect(contents).toContain('好。');
    // Memory sits right after the main system prompt.
    expect(prompt.messages[1].content).toContain('<story_memory>');
    expect(prompt.coveredMessages).toBe(2);
    expect(prompt.tokens).toBeGreaterThan(0);
  });

  it('ignores an out-of-range summary index', () => {
    const messages = [msg('user', '你好', 'u1')];
    const prompt = buildPrompt(character, [], messages, DEFAULT_SETTINGS, {
      summary: '旧记忆',
      throughIndex: 99,
      updatedAt: 0,
    });
    expect(prompt.messages.some((m) => m.content.includes('旧记忆'))).toBe(true);
    expect(prompt.messages.some((m) => m.content === '你好')).toBe(true);
  });
});
