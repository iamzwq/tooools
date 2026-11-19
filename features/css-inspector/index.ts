import type { Feature } from '@/features/types';
import { arrayBufferToDataUrl, fetchImage } from '@/lib/image';
import { onMessage } from '@/utils/messaging';
import { CSS_INSPECTOR_COMMAND, CSS_INSPECTOR_FETCH_IMAGE, type FetchImageMessage } from './messages';
import { startCssInspector } from './start';

/** For element screenshots: fetches images/fonts the page can't load cross-origin. */
async function fetchAsDataUrl(url: string): Promise<string | null> {
  if (!/^https?:/i.test(url)) return null;
  try {
    const { data, mimeType } = await fetchImage(url);
    return arrayBufferToDataUrl(data, mimeType);
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
    onMessage<FetchImageMessage, string | null>(CSS_INSPECTOR_FETCH_IMAGE, ({ url }) => fetchAsDataUrl(String(url)));
  },
};
