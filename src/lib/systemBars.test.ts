// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { KEYBOARD_EVENT, applyInsets, isEdgeToEdgeShell } from './systemBars';

describe('system bar insets', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.theme;
  });

  it('publishes the measured bars as CSS custom properties', () => {
    applyInsets({ top: 24, bottom: 16, left: 0, right: 0 });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--safe-top')).toBe('24px');
    expect(style.getPropertyValue('--safe-bottom')).toBe('16px');
    expect(style.getPropertyValue('--safe-left')).toBe('0px');
    expect(style.getPropertyValue('--safe-right')).toBe('0px');
  });

  it('rounds fractional values', () => {
    applyInsets({ top: 24.6, bottom: 8.2, left: 0, right: 0 });
    expect(document.documentElement.style.getPropertyValue('--safe-top')).toBe('25px');
    expect(document.documentElement.style.getPropertyValue('--safe-bottom')).toBe('8px');
  });

  it('never lets a broken inset move the layout', () => {
    applyInsets({ top: -12, bottom: Number.NaN, left: Number.POSITIVE_INFINITY, right: 0 });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--safe-top')).toBe('0px');
    expect(style.getPropertyValue('--safe-bottom')).toBe('0px');
    expect(style.getPropertyValue('--safe-left')).toBe('0px');
  });

  it('resets to zero when there are no insets', () => {
    applyInsets({ top: 24, bottom: 16, left: 0, right: 0 });
    applyInsets(null);
    expect(document.documentElement.style.getPropertyValue('--safe-top')).toBe('0px');
    expect(document.documentElement.style.getPropertyValue('--safe-bottom')).toBe('0px');
  });

  it('is inert outside the Android app', () => {
    expect(isEdgeToEdgeShell()).toBe(false);
  });
});

describe('on-screen keyboard inset', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.documentElement.classList.remove('keyboard-open');
  });

  it('publishes the keyboard height and flags the open state', () => {
    applyInsets({ top: 24, bottom: 16, left: 0, right: 0, ime: 312 });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--keyboard-inset')).toBe('312px');
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(true);
  });

  it('is zero when the keyboard is closed', () => {
    applyInsets({ top: 24, bottom: 16, left: 0, right: 0, ime: 0 });
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px');
    expect(document.documentElement.classList.contains('keyboard-open')).toBe(false);
  });

  it('defaults to zero for shells that do not report a keyboard', () => {
    applyInsets({ top: 24, bottom: 16, left: 0, right: 0 });
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px');
  });

  it('announces keyboard changes so views can scroll', () => {
    const seen: number[] = [];
    const onKeyboard = (event: Event) => seen.push((event as CustomEvent).detail.height);
    window.addEventListener(KEYBOARD_EVENT, onKeyboard);
    applyInsets({ top: 0, bottom: 0, left: 0, right: 0, ime: 280 });
    applyInsets({ top: 0, bottom: 0, left: 0, right: 0, ime: 0 });
    window.removeEventListener(KEYBOARD_EVENT, onKeyboard);
    expect(seen).toEqual([280, 0]);
  });
});
