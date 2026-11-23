import { browser } from 'wxt/browser';
import { ELEMENT_ERASER_RESTORE, ELEMENT_ERASER_START, ELEMENT_ERASER_STATUS } from './messages';

/** Starts element eraser mode in the tab, injecting the content script on first use. */
export async function startElementEraser(tabId: number): Promise<void> {
  try {
    const loaded = await browser.tabs.sendMessage(tabId, { type: ELEMENT_ERASER_START }, { frameId: 0 });
    if (loaded === true) return;
  } catch {
    // No listener yet: the script hasn't been injected into this page.
  }
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/element-eraser.js'] });
  } catch {
    throw new Error('当前页面不支持元素擦除（浏览器内置页面、扩展商店等受保护页面无法注入脚本）');
  }
}

/** Returns how many elements are currently hidden on the tab (0 if script is not loaded). */
export async function getElementEraserCount(tabId: number): Promise<number> {
  try {
    const count = await browser.tabs.sendMessage(tabId, { type: ELEMENT_ERASER_STATUS }, { frameId: 0 });
    return typeof count === 'number' ? count : 0;
  } catch {
    return 0;
  }
}

/** Restores all hidden elements on the tab. */
export async function restoreElementEraser(tabId: number): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: ELEMENT_ERASER_RESTORE }, { frameId: 0 });
  } catch {
    // Script not loaded on this tab, nothing to restore.
  }
}
