import { browser } from 'wxt/browser';
import { features } from '@/features';
import type { FeatureContextMenu } from '@/features/types';
import { getFeatureEnabledMap, isFeatureEnabled, watchFeatureEnabled } from '@/utils/feature-settings';
import { notify } from '@/utils/notify';

const menuHandlers = new Map<string, FeatureContextMenu>();
for (const feature of features) {
  for (const menu of feature.contextMenus ?? []) menuHandlers.set(`${feature.id}:${menu.id}`, menu);
}

let rebuilding: Promise<void> = Promise.resolve();

/** Recreates right-click menus for enabled features (serialized to avoid duplicate-id errors). */
function rebuildMenus(): Promise<void> {
  rebuilding = rebuilding.then(async () => {
    await browser.contextMenus.removeAll();
    const enabled = await getFeatureEnabledMap();
    for (const feature of features) {
      if (!isFeatureEnabled(feature, enabled)) continue;
      for (const menu of feature.contextMenus ?? []) {
        browser.contextMenus.create({
          id: `${feature.id}:${menu.id}`,
          title: menu.title,
          contexts: menu.contexts,
        });
      }
    }
  }).catch((err) => console.error('[tooools] rebuild menus failed', err));
  return rebuilding;
}

export default defineBackground(() => {
  for (const feature of features) {
    try {
      feature.setupBackground?.();
    } catch (err) {
      console.error(`[tooools] setup ${feature.id} failed`, err);
    }
  }

  browser.runtime.onInstalled.addListener(() => void rebuildMenus());
  browser.runtime.onStartup.addListener(() => void rebuildMenus());
  watchFeatureEnabled(() => void rebuildMenus());

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const menu = menuHandlers.get(String(info.menuItemId));
    if (!menu) return;
    try {
      await menu.onClick(info, tab);
    } catch (err) {
      console.error(`[tooools] menu ${info.menuItemId} failed`, err);
      await notify('操作失败', err instanceof Error ? err.message : String(err));
    }
  });
});
