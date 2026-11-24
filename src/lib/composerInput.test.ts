// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncControlledTextarea } from './composerInput';

/**
 * Android IMEs can write text straight into the DOM without firing `input`.
 * The sync exists so React's controlled value follows, and it must stay out of
 * the way while a composition is open — that is what keeps long-press delete
 * and clipboard pastes working on the phone.
 */
describe('syncControlledTextarea', () => {
  let element: HTMLTextAreaElement;
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    element = document.createElement('textarea');
    element.value = '';
    document.body.appendChild(element);
    element.focus();
  });

  afterEach(() => {
    stop();
    element.remove();
    vi.useRealTimers();
  });

  it('picks up text the IME commits without an input event', () => {
    const seen: string[] = [];
    stop = syncControlledTextarea(element, (value) => seen.push(value));

    element.value = '剪贴板粘贴的文字';
    vi.advanceTimersByTime(200);

    expect(seen).toEqual(['剪贴板粘贴的文字']);
  });

  it('does not repeat itself while the value is unchanged', () => {
    const onValue = vi.fn();
    stop = syncControlledTextarea(element, onValue);

    vi.advanceTimersByTime(600);
    expect(onValue).not.toHaveBeenCalled();

    element.value = 'a';
    vi.advanceTimersByTime(600);
    expect(onValue).toHaveBeenCalledTimes(1);
  });

  it('holds the sync while a composition is open, then catches up', () => {
    const seen: string[] = [];
    stop = syncControlledTextarea(element, (value) => seen.push(value));

    element.dispatchEvent(new Event('compositionstart'));
    element.value = 'ni';
    vi.advanceTimersByTime(400);
    expect(seen).toEqual([]);

    element.value = '你';
    element.dispatchEvent(new Event('compositionend'));
    expect(seen).toEqual(['你']);
  });

  it('stops polling once it is detached', () => {
    const onValue = vi.fn();
    stop = syncControlledTextarea(element, onValue);
    stop();

    element.value = 'after cleanup';
    vi.advanceTimersByTime(600);
    expect(onValue).not.toHaveBeenCalled();
  });
});
