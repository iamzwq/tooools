import type { Browser } from 'wxt/browser';

export type MenuContext = `${Browser.contextMenus.ContextType}`;

export interface FeatureContextMenu {
  /** Unique within the feature; the global menu id becomes `${feature.id}:${id}`. */
  id: string;
  title: string;
  contexts: [MenuContext, ...MenuContext[]];
  /** Local id of the parent menu (declared earlier in the same feature) to create a submenu item. */
  parentId?: string;
  /** Omit for parent menus that only group submenu items. */
  onClick?: (info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) => void | Promise<void>;
}

export interface FeatureCommand {
  /** Command name; must also be declared under `commands` in wxt.config.ts (the manifest is static). */
  name: string;
  onCommand: (tab?: Browser.tabs.Tab) => void | Promise<void>;
}

export interface Feature {
  /** Stable id, used as storage key and menu id prefix. */
  id: string;
  name: string;
  description: string;
  defaultEnabled?: boolean;
  /** Right-click menus, created only while the feature is enabled. */
  contextMenus?: FeatureContextMenu[];
  /** Keyboard shortcuts, ignored while the feature is disabled. */
  commands?: FeatureCommand[];
  /** Runs once when the background service worker starts (register listeners here). */
  setupBackground?: () => void;
}
// Popup settings UI (React) is registered separately in features/options.ts so React
// never ends up in the background service worker bundle.
