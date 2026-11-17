// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyInsets, isEdgeToEdgeShell } from './systemBars';

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
