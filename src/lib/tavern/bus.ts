export interface ScriptButtonInfo {
  /** Stable id used by React keys. */
  id: string;
  scriptId: string;
  scriptName: string;
  label: string;
  /** Event name to emit when the button is pressed. */
  event: string;
}

interface ButtonOwner {
  scriptId: string;
  scriptName: string;
  buttons: { label: string; event: string }[];
}

/** Registry that lets React render the buttons card scripts ask for. */
class ScriptBus {
  private owners = new Map<string, ButtonOwner>();
  private listeners = new Set<() => void>();

  setButtons(
    iframeId: string,
    scriptId: string,
    scriptName: string,
    buttons: { label: string; event: string }[],
  ) {
    this.owners.set(iframeId, { scriptId, scriptName, buttons });
    this.notify();
  }

  removeIframe(iframeId: string) {
    if (this.owners.delete(iframeId)) this.notify();
  }

  clear() {
    if (this.owners.size === 0) return;
    this.owners.clear();
    this.notify();
  }

  snapshot(): ScriptButtonInfo[] {
    const out: ScriptButtonInfo[] = [];
    for (const [iframeId, owner] of this.owners) {
      owner.buttons.forEach((button, index) => {
        out.push({
          id: `${iframeId}::${index}`,
          scriptId: owner.scriptId,
          scriptName: owner.scriptName,
          label: button.label,
          event: button.event,
        });
      });
    }
    return out;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch {
        // ignore listener errors
      }
    }
  }
}

export const scriptBus = new ScriptBus();

/** Callbacks the chat UI registers so scripts can drive the app. */
export const chatActions: {
  trigger?: () => void;
  send?: (text: string) => void;
  setInput?: (text: string) => void;
} = {};
