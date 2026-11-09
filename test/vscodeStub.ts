type Listener<T> = (value: T) => unknown;

export interface Disposable {
  dispose(): void;
}

export class EventEmitter<T> implements Disposable {
  private listeners: Listener<T>[] = [];

  readonly event = (listener: Listener<T>): Disposable => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((entry) => entry !== listener); } };
  };

  fire(value: T): void {
    [...this.listeners].forEach((listener) => listener(value));
  }

  dispose(): void {
    this.listeners = [];
  }
}

const windowStateEmitter = new EventEmitter<{ focused: boolean }>();

export const window = {
  state: { focused: true },
  onDidChangeWindowState: windowStateEmitter.event,
};

export function setWindowFocus(focused: boolean): void {
  window.state = { focused };
  windowStateEmitter.fire(window.state);
}
