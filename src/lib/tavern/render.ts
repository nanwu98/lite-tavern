export type MessageSegment =
  { kind: 'markdown'; text: string } | { kind: 'frontend'; html: string };

const FENCE = /```([^\n`]*)\n([\s\S]*?)\n```/g;

/** Mirrors 酒馆助手's `isFrontend`: a code block that looks like a whole page. */
export function isFrontendHtml(content: string): boolean {
  return ['html>', '<head>', '<body', '<!doctype html'].some((tag) =>
    content.toLowerCase().includes(tag),
  );
}

/** Splits a message into markdown chunks and renderable card pages. */
export function splitMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;
  FENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE.exec(content))) {
    const [whole, , body] = match;
    if (!isFrontendHtml(body)) continue;
    if (match.index > cursor) {
      segments.push({ kind: 'markdown', text: content.slice(cursor, match.index) });
    }
    segments.push({ kind: 'frontend', html: body });
    cursor = match.index + whole.length;
  }
  if (cursor < content.length) {
    segments.push({ kind: 'markdown', text: content.slice(cursor) });
  }
  return segments.length ? segments : [{ kind: 'markdown', text: content }];
}
