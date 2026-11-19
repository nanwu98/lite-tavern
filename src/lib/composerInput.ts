/**
 * Keeps a controlled textarea in sync with the text the DOM actually holds.
 *
 * Some Android IMEs (Xiaomi/HyperOS T9 keyboards among them) commit text into
 * the textarea without firing the `input` / `beforeinput` events React listens
 * to. The box then shows text that React never saw, so anything driven by the
 * value — the disabled send button, the character counter — stays stale.
 *
 * Hooking every native editing event covers most keyboards; the poll while the
 * element has focus covers the ones that commit silently. `last` is compared
 * first so a normal keystroke costs one string compare, not a render.
 */
export function syncControlledTextarea(
  element: HTMLTextAreaElement | null,
  onValue: (value: string) => void,
  pollMs = 180,
): () => void {
  if (!element) return () => undefined;

  let last = element.value;
  const sync = () => {
    if (element.value === last) return;
    last = element.value;
    onValue(element.value);
  };

  const events = [
    'input',
    'change',
    'compositionupdate',
    'compositionend',
    'keyup',
    'paste',
    'cut',
    'drop',
    'blur',
  ] as const;
  for (const type of events) element.addEventListener(type, sync);

  const timer = window.setInterval(() => {
    if (document.activeElement === element) sync();
  }, pollMs);

  return () => {
    for (const type of events) element.removeEventListener(type, sync);
    window.clearInterval(timer);
  };
}
