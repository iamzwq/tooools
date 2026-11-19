import { browser } from 'wxt/browser';
import type { Feature } from '@/features/types';
import { CSS_INSPECTOR_COMMAND, CSS_INSPECTOR_FETCH_IMAGE, type FetchImageMessage } from './messages';
import { startCssInspector } from './start';

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

export const cssInspector: Feature = {
  id: 'css-inspector',
  name: '检查元素 CSS',
  description: '悬停高亮页面元素，点击后查看并复制它的 CSS，或导出为图片',
  contextMenus: [
    {
      id: 'start',
      title: '检查元素 CSS',
      contexts: ['page', 'link', 'image', 'selection', 'video', 'audio', 'editable'],
      onClick: (_info, tab) => {
        if (tab?.id != null) return startCssInspector(tab.id);
      },
    },
  ],
  commands: [
    {
      name: CSS_INSPECTOR_COMMAND,
      onCommand: (tab) => {
        if (tab?.id != null) return startCssInspector(tab.id);
      },
    },
  ],
  setupBackground() {
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const msg = message as Partial<FetchImageMessage> | null;
      if (msg?.type !== CSS_INSPECTOR_FETCH_IMAGE || typeof msg.url !== 'string' || !/^https?:/i.test(msg.url)) return;
      void fetchAsDataUrl(msg.url).then(sendResponse);
      return true;
    });
  },
};
