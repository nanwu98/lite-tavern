import { memo, useMemo } from 'react';
import { renderMessageMarkdown } from '../lib/format';
import { FrontendFrame } from './FrontendFrame';
import { splitMessageContent } from '../lib/tavern/render';

export { isFrontendHtml, splitMessageContent } from '../lib/tavern/render';
export type { MessageSegment } from '../lib/tavern/render';

interface MessageContentProps {
  content: string;
  chatId: string;
  messageIndex: number;
  /** While a reply streams we keep code blocks as text for a stable layout. */
  allowFrames?: boolean;
}

/**
 * Turning markdown into HTML is the expensive part of a message row: marked
 * parses the text, DOMPurify sanitises the result and the quote highlighter
 * rebuilds the DOM a third time. Doing that for *every* message on *every*
 * streamed token is what made replies arrive in one- to two-second lumps while
 * the main thread was busy. The HTML is memoised per segment and the component
 * is memoised too, so a streaming reply only re-renders itself.
 */
function MessageContentImpl({
  content,
  chatId,
  messageIndex,
  allowFrames = true,
}: MessageContentProps) {
  const segments = useMemo(
    () =>
      allowFrames ? splitMessageContent(content) : [{ kind: 'markdown' as const, text: content }],
    [content, allowFrames],
  );

  const html = useMemo(
    () =>
      segments.map((segment) =>
        segment.kind === 'markdown' ? renderMessageMarkdown(segment.text) : '',
      ),
    [segments],
  );

  if (segments.length === 1 && segments[0].kind === 'markdown') {
    return <div className="markdown" dangerouslySetInnerHTML={{ __html: html[0] }} />;
  }

  return (
    <div className="message-segments">
      {segments.map((segment, index) =>
        segment.kind === 'frontend' ? (
          <FrontendFrame
            key={`frame-${index}-${segment.html.length}`}
            html={segment.html}
            chatId={chatId}
            messageIndex={messageIndex}
          />
        ) : segment.text.trim() ? (
          <div
            key={`md-${index}`}
            className="markdown"
            dangerouslySetInnerHTML={{ __html: html[index] }}
          />
        ) : null,
      )}
    </div>
  );
}

export const MessageContent = memo(MessageContentImpl);
