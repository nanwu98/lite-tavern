import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { highlightQuotedHtml } from './quotes';

marked.setOptions({ gfm: true, breaks: true });
let hookInstalled = false;

export function renderMarkdown(text: string): string {
  if (!text) return '';
  if (!hookInstalled) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    hookInstalled = true;
  }
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button'],
  });
}

/**
 * Markdown for a chat message: sanitized HTML plus the quoted-dialogue
 * highlight (the same rule SillyTavern applies to `.mes_text q`).
 */
export function renderMessageMarkdown(text: string): string {
  return highlightQuotedHtml(renderMarkdown(text));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
