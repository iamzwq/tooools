import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { PanelTab } from '@/features/video-summary/ui/SummaryPanel';

/** Whether 小T was hidden on this page; it shows again when the page reloads. */
export interface PageVisibility {
  isHidden: () => boolean;
  setHidden: (hidden: boolean) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPageVisibility(): PageVisibility {
  let hidden = false;
  const listeners = new Set<() => void>();
  return {
    isHidden: () => hidden,
    setHidden(next) {
      if (next === hidden) return;
      hidden = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface RequestChannel<T> {
  emit(value: T): void;
  subscribe(listener: (value: T) => void): () => void;
}

/** Delivers requests to the UI, keeping the latest one until the UI subscribes. */
export function createRequestChannel<T>(): RequestChannel<T> {
  const listeners = new Set<(value: T) => void>();
  let pending: { value: T } | null = null;
  return {
    emit(value) {
      if (listeners.size) listeners.forEach((listener) => listener(value));
      else pending = { value };
    },
    subscribe(listener) {
      listeners.add(listener);
      if (pending) {
        const { value } = pending;
        pending = null;
        listener(value);
      }
      return () => listeners.delete(listener);
    },
  };
}

/**
 * What the small `assistant` script that runs on every page shares with the `assistant-ui` script it
 * loads where 小T shows. Both run in the extension's isolated world, so they meet on its global object.
 */
export interface AssistantBridge {
  /** The loader's context: the UI goes away with it, e.g. when a newer copy of the script replaces it. */
  ctx: ContentScriptContext;
  visibility: PageVisibility;
  /** "Open the summary panel" requests from the popup. */
  requests: RequestChannel<PanelTab>;
}

const BRIDGE_KEY = '__toooolsAssistant';
type BridgeGlobal = typeof globalThis & { [BRIDGE_KEY]?: AssistantBridge };

export function publishAssistantBridge(bridge: AssistantBridge): void {
  (globalThis as BridgeGlobal)[BRIDGE_KEY] = bridge;
}

export function getAssistantBridge(): AssistantBridge | undefined {
  return (globalThis as BridgeGlobal)[BRIDGE_KEY];
}
