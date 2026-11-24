/**
 * Keeps a controlled textarea in sync with the text the DOM actually holds.
 *
 * Android IMEs are not required to fire the `input` / `beforeinput` events
 * React listens to before they commit text. Some (Xiaomi/HyperOS T9 keyboards
 * among them) write straight into the textarea, or replay a commit after the
 * fact. React then keeps a stale value: the send button stays grey, the
 * character counter lags, and the next render can write that stale value back
 * and swallow the text that was just pasted.
 *
 * Hooking the native editing events covers most keyboards; the poll while the
 * element has focus covers the ones that commit silently. `last` is compared
 * first so a normal keystroke costs one string compare, not a render.
 *
 * The sync stays out of the way while an IME composition is open. Composing
 * text already reaches React through its own `onChange`; pushing a value back
 * mid-composition is what makes Android IMEs drop backspace repeats, the
 * long-press "clear the field" gesture and clipboard pastes.
 */
export function syncControlledTextarea(
  element: HTMLTextAreaElement | null,
  onValue: (value: string) => void,
  pollMs = 180,
): () => void {
  if (!element) return () => undefined;

  let last = element.value;
  let composing = false;

  const sync = () => {
    if (composing || element.value === last) return;
    last = element.value;
    onValue(element.value);
  };

  // Composition is tracked separately so the poll below cannot interrupt it.
  const onCompositionStart = () => {
    composing = true;
  };
  const onCompositionEnd = () => {
    composing = false;
    sync();
  };

  const events = ['input', 'change', 'keyup', 'paste', 'cut', 'drop', 'blur'] as const;
  for (const type of events) element.addEventListener(type, sync);
  element.addEventListener('compositionstart', onCompositionStart);
  element.addEventListener('compositionend', onCompositionEnd);

  const timer = window.setInterval(() => {
    if (document.activeElement === element) sync();
  }, pollMs);

  return () => {
    for (const type of events) element.removeEventListener(type, sync);
    element.removeEventListener('compositionstart', onCompositionStart);
    element.removeEventListener('compositionend', onCompositionEnd);
    window.clearInterval(timer);
  };
}
