import { useMemo } from 'react';
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

export function MessageContent({
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

  if (segments.length === 1 && segments[0].kind === 'markdown') {
    return (
      <div
        className="markdown"
        dangerouslySetInnerHTML={{ __html: renderMessageMarkdown(segments[0].text) }}
      />
    );
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
            dangerouslySetInnerHTML={{ __html: renderMessageMarkdown(segment.text) }}
          />
        ) : null,
      )}
    </div>
  );
}
