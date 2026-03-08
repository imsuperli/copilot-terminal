type PtyDataPayload = {
  windowId: string;
  paneId?: string;
  data: string;
};

type PtyDataSubscriber = (payload: PtyDataPayload) => void;

type ElectronPtyHandler = (event: unknown, payload: PtyDataPayload) => void;

const subscribersByPaneKey = new Map<string, Set<PtyDataSubscriber>>();
let globalPtyHandler: ElectronPtyHandler | null = null;

function getPaneKey(windowId: string, paneId?: string): string {
  return `${windowId}:${paneId ?? ''}`;
}

function ensureGlobalSubscription(): void {
  if (globalPtyHandler) {
    return;
  }

  globalPtyHandler = (_event, payload) => {
    const paneKey = getPaneKey(payload.windowId, payload.paneId);
    const subscribers = subscribersByPaneKey.get(paneKey);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    for (const subscriber of subscribers) {
      try {
        subscriber(payload);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[ptyDataBus] Subscriber callback failed:', error);
        }
      }
    }
  };

  window.electronAPI.onPtyData(globalPtyHandler);
}

function cleanupGlobalSubscriptionIfIdle(): void {
  if (subscribersByPaneKey.size > 0) {
    return;
  }

  if (!globalPtyHandler) {
    return;
  }

  window.electronAPI.offPtyData(globalPtyHandler);
  globalPtyHandler = null;
}

/**
 * 按 windowId + paneId 订阅 PTY 数据。
 * 相比每个 TerminalPane 都直接监听 electron API，
 * 这里使用全局单监听，避免高输出时的监听器回调放大。
 */
export function subscribeToPanePtyData(
  windowId: string,
  paneId: string,
  callback: (data: string) => void
): () => void {
  ensureGlobalSubscription();

  const paneKey = getPaneKey(windowId, paneId);
  const subscribers = subscribersByPaneKey.get(paneKey) ?? new Set<PtyDataSubscriber>();

  const subscriber: PtyDataSubscriber = (payload) => {
    callback(payload.data);
  };

  subscribers.add(subscriber);
  subscribersByPaneKey.set(paneKey, subscribers);

  return () => {
    const currentSubscribers = subscribersByPaneKey.get(paneKey);
    if (!currentSubscribers) {
      return;
    }

    currentSubscribers.delete(subscriber);
    if (currentSubscribers.size === 0) {
      subscribersByPaneKey.delete(paneKey);
    }

    cleanupGlobalSubscriptionIfIdle();
  };
}

