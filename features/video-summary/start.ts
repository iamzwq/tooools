import { browser } from 'wxt/browser';
import { VIDEO_SUMMARY_OPEN } from './messages';

const LOADING_RETRY_MS = 250;
const LOADING_RETRIES = 20;

/** Opens the summary panel on the tab, injecting the assistant into pages opened before install. */
export async function openVideoSummary(tabId: number): Promise<void> {
  const send = () =>
    browser.tabs.sendMessage(tabId, { type: VIDEO_SUMMARY_OPEN, tab: 'summary' }, { frameId: 0 }).catch(() => undefined);
  if ((await send()) === true) return;
  // A page that's still loading gets the script once it's ready; injecting another copy now would be wasted.
  for (let i = 0; i < LOADING_RETRIES && (await browser.tabs.get(tabId)).status === 'loading'; i++) {
    await new Promise((resolve) => setTimeout(resolve, LOADING_RETRY_MS));
    if ((await send()) === true) return;
  }
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/assistant.js'] });
  } catch {
    throw new Error('无法在当前页面打开视频总结，请刷新页面后重试');
  }
  if ((await send()) !== true) throw new Error('页面还没准备好，请刷新页面后重试');
}
