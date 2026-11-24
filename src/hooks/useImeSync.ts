import { useEffect, useRef, type RefObject } from 'react';
import { syncControlledTextarea } from '../lib/composerInput';

/**
 * Keeps a controlled textarea in step with what the DOM actually holds while an
 * Android IME is typing into it.
 *
 * `syncControlledTextarea` attaches the native editing events and the focus
 * poll; this hook only keeps the latest value handler (so an inline callback
 * never restarts the poll) and tears the sync down when the field is no longer
 * mounted or active.
 *
 * Long-text fields that users paste into — the card prompt and greeting, the
 * persona, world-book entries — need the same safety net as the chat composer.
 */
export function useImeSync(
  ref: RefObject<HTMLTextAreaElement | null>,
  onValue: (value: string) => void,
  active = true,
): void {
  const handler = useRef(onValue);
  handler.current = onValue;

  useEffect(() => {
    if (!active) return;
    return syncControlledTextarea(ref.current, (value) => handler.current(value));
  }, [active, ref]);
}
