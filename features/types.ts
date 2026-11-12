import type { Browser } from 'wxt/browser';

export type MenuContext = `${Browser.contextMenus.ContextType}`;

export interface FeatureContextMenu {
  /** Unique within the feature; the global menu id becomes `${feature.id}:${id}`. */
  id: string;
  title: string;
  contexts: [MenuContext, ...MenuContext[]];
  onClick: (info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) => void | Promise<void>;
}

export interface Feature {
  /** Stable id, used as storage key and menu id prefix. */
  id: string;
  name: string;
  description: string;
  defaultEnabled?: boolean;
  /** Right-click menus, created only while the feature is enabled. */
  contextMenus?: FeatureContextMenu[];
  /** Runs once when the background service worker starts (register listeners here). */
  setupBackground?: () => void;
}
// Popup settings UI (React) is registered separately in features/options.ts so React
// never ends up in the background service worker bundle.
