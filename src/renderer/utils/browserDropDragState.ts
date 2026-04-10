type BrowserDropDragActiveListener = (active: boolean) => void;

const listeners = new Set<BrowserDropDragActiveListener>();
let browserDropDragActive = false;
let resetListenersInstalled = false;

function notifyBrowserDropDragActive(): void {
  for (const listener of listeners) {
    listener(browserDropDragActive);
  }
}

function ensureResetListeners(): void {
  if (resetListenersInstalled || typeof window === 'undefined') {
    return;
  }

  const reset = () => {
    setBrowserDropDragActive(false);
  };

  window.addEventListener('drop', reset, true);
  window.addEventListener('dragend', reset, true);
  window.addEventListener('blur', reset);
  resetListenersInstalled = true;
}

export function getBrowserDropDragActive(): boolean {
  return browserDropDragActive;
}

export function setBrowserDropDragActive(active: boolean): void {
  if (browserDropDragActive === active) {
    return;
  }

  browserDropDragActive = active;
  notifyBrowserDropDragActive();
}

export function subscribeBrowserDropDragActive(
  listener: BrowserDropDragActiveListener,
): () => void {
  ensureResetListeners();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
