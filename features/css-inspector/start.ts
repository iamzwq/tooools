import { browser } from 'wxt/browser';
import { CSS_INSPECTOR_START } from './messages';

/** Starts pick mode in the tab, injecting the content script on first use. */
export async function startCssInspector(tabId: number): Promise<void> {
  try {
    // Other content scripts (e.g. image-export) also listen, so only an explicit `true` means it's loaded.
    const loaded = await browser.tabs.sendMessage(tabId, { type: CSS_INSPECTOR_START }, { frameId: 0 });
    if (loaded === true) return;
  } catch {
    // No listener yet: the script hasn't been injected into this page.
  }
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/css-inspector.js'] });
  } catch {
    throw new Error('当前页面不支持检查元素（浏览器内置页面、扩展商店等受保护页面无法注入脚本）');
  }
}
