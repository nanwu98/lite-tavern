import type { Character, Settings } from '../../types';
import { applyRegexScripts } from './regex';
import { substitudeMacros } from './macros';

/** Applies the card's markdown-only regex scripts to chat text for display. */
export function displayText(
  text: string,
  character: Character | undefined,
  settings: Settings,
  depth: number,
  role: 'user' | 'assistant' = 'assistant',
): string {
  const scripts = character?.code?.regexScripts;
  if (!text || !scripts?.length) return text;
  return applyRegexScripts(text, scripts, {
    macro: (value) => substitudeMacros(value, { character, settings }),
    mode: 'display',
    depth,
    placement: role === 'user' ? 1 : 2,
  });
}
