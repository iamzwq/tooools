import { browser } from 'wxt/browser';
import type { Feature } from '@/features/types';
import { notify } from '@/utils/notify';
import { getPan123Auth, pan123FolderItem, PAN123_HOME } from './auth';
import { Pan123AuthError, Pan123Client } from './client';
import { buildFileName, fetchImage } from './image';

const folderIdCache = new Map<string, number>();

async function saveImage(srcUrl: string, tabId?: number, frameId?: number): Promise<void> {
  const notifyId = await notify('保存到 123云盘', '正在保存图片…');
  try {
    const auth = await getPan123Auth();
    if (!auth) {
      await notify('保存到 123云盘', '未检测到登录信息，请先打开 123云盘网页并登录', notifyId);
      await browser.tabs.create({ url: PAN123_HOME });
      return;
    }
    const client = new Pan123Client(auth);

    const folderName = (await pan123FolderItem.getValue()).trim();
    let parentId = 0;
    if (folderName) {
      const cacheKey = `${auth.origin}|${folderName}`;
      parentId = folderIdCache.get(cacheKey) ?? (await client.ensureFolder(folderName));
      folderIdCache.set(cacheKey, parentId);
    }

    const image = await fetchImage(srcUrl, tabId, frameId);
    const fileName = buildFileName(srcUrl, image.mimeType);
    const { reused } = await client.uploadFile(parentId, fileName, image.data);

    const where = folderName ? `「${folderName}」` : '根目录';
    await notify('保存成功', `${fileName} 已${reused ? '秒传' : '上传'}到 ${where}`, notifyId);
  } catch (err) {
    folderIdCache.clear();
    const message = err instanceof Error ? err.message : String(err);
    await notify('保存失败', message, notifyId);
    if (err instanceof Pan123AuthError) await browser.tabs.create({ url: PAN123_HOME });
    console.error('[save-image-to-123pan]', err);
  }
}

export const saveImageTo123Pan: Feature = {
  id: 'save-image-to-123pan',
  name: '图片保存到 123云盘',
  description: '在网页图片上右击，一键保存到 123云盘（使用浏览器中已登录的账号）',
  contextMenus: [
    {
      id: 'save',
      title: '保存图片到 123云盘',
      contexts: ['image'],
      onClick: (info, tab) => {
        if (info.srcUrl) return saveImage(info.srcUrl, tab?.id, info.frameId);
      },
    },
  ],
};
