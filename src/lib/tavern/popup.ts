/**
 * Minimal DOM modal used to emulate SillyTavern's `callGenericPopup` for card
 * scripts (MVU and friends render small tables/forms through it).
 */
export type PopupType = 'text' | 'confirm' | 'input' | 'display';

export interface PopupOptions {
  okButton?: string;
  cancelButton?: string;
  wide?: boolean;
  allowVerticalScrolling?: boolean;
  leftAlign?: boolean;
}

export const POPUP_TYPE = {
  TEXT: 1,
  CONFIRM: 2,
  INPUT: 3,
  DISPLAY: 4,
} as const;

export const POPUP_RESULT = {
  AFFIRMATIVE: 1,
  NEGATIVE: 0,
  CANCELLED: null,
} as const;

let openCount = 0;

export function showPopup(
  content: string,
  type: PopupType = 'text',
  inputValue = '',
  options: PopupOptions = {},
): Promise<string | number | boolean | null> {
  return new Promise((resolve) => {
    openCount += 1;
    const overlay = document.createElement('div');
    overlay.className = 'lt-popup-overlay';
    overlay.setAttribute('data-lt-popup', 'true');

    const panel = document.createElement('div');
    panel.className = `lt-popup${options.wide ? ' is-wide' : ''}`;

    const body = document.createElement('div');
    body.className = 'lt-popup-body';
    if (/<[a-z][\s\S]*>/i.test(content)) body.innerHTML = content;
    else body.textContent = content;
    if (options.leftAlign) body.classList.add('is-left');
    if (options.allowVerticalScrolling) body.classList.add('is-scroll');
    panel.appendChild(body);

    let input: HTMLInputElement | null = null;
    if (type === 'input') {
      input = document.createElement('input');
      input.className = 'lt-popup-input';
      input.type = 'text';
      input.value = inputValue;
      panel.appendChild(input);
    }

    const footer = document.createElement('div');
    footer.className = 'lt-popup-footer';

    const close = (value: string | number | boolean | null) => {
      openCount = Math.max(0, openCount - 1);
      overlay.remove();
      resolve(value);
    };

    if (type === 'confirm' || type === 'input') {
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost';
      cancel.textContent = options.cancelButton || '取消';
      cancel.onclick = () => close(type === 'confirm' ? 0 : null);
      footer.appendChild(cancel);
    }

    const ok = document.createElement('button');
    ok.className = 'btn btn-accent';
    ok.textContent = options.okButton || (type === 'confirm' ? '确定' : '好');
    ok.onclick = () => {
      if (type === 'confirm') close(1);
      else if (type === 'input') close(input?.value ?? '');
      else close('');
    };
    footer.appendChild(ok);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay && type !== 'confirm') close(type === 'input' ? null : '');
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      if (input) input.focus();
      else ok.focus();
    });
  });
}

export function hasOpenPopup(): boolean {
  return openCount > 0;
}
