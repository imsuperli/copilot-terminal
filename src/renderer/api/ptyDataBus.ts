import type { PtyDataPayload } from '../../shared/types/electron-api';

type PtyDataSubscriber = (payload: PtyDataPayload) => void;

type ElectronPtyHandler = (event: unknown, payload: PtyDataPayload) => void;

type PaneSubscriptionOptions = {
  replayBuffered?: boolean;
};

const subscribersByPaneKey = new Map<string, Set<PtyDataSubscriber>>();
const earlyDataBuffers = new Map<string, PtyDataPayload[]>();
const EARLY_BUFFER_LIMIT = 100;
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
      const buffer = earlyDataBuffers.get(paneKey) ?? [];
      buffer.push(payload);
      if (buffer.length > EARLY_BUFFER_LIMIT) {
        buffer.shift();
      }
      earlyDataBuffers.set(paneKey, buffer);
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

ensureGlobalSubscription();

/**
 * 按 windowId + paneId 订阅 PTY 数据。
 * 相比每个 TerminalPane 都直接监听 electron API，
 * 这里使用全局单监听，避免高输出时的监听器回调放大。
 */
export function subscribeToPanePtyData(
  windowId: string,
  paneId: string,
  callback: (payload: PtyDataPayload) => void,
  options: PaneSubscriptionOptions = {}
): () => void {
  ensureGlobalSubscription();
  const { replayBuffered = true } = options;

  const paneKey = getPaneKey(windowId, paneId);
  const subscribers = subscribersByPaneKey.get(paneKey) ?? new Set<PtyDataSubscriber>();

  const subscriber: PtyDataSubscriber = (payload) => {
    callback(payload);
  };

  subscribers.add(subscriber);
  subscribersByPaneKey.set(paneKey, subscribers);

  if (replayBuffered) {
    const earlyData = earlyDataBuffers.get(paneKey);
    if (earlyData && earlyData.length > 0) {
      for (const payload of earlyData) {
        subscriber(payload);
      }
      earlyDataBuffers.delete(paneKey);
    }
  }

  return () => {
    const currentSubscribers = subscribersByPaneKey.get(paneKey);
    if (!currentSubscribers) {
      return;
    }

    currentSubscribers.delete(subscriber);
    if (currentSubscribers.size === 0) {
      subscribersByPaneKey.delete(paneKey);
    }
  };
}
