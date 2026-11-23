import type { Feature } from '@/features/types';
import { ELEMENT_ERASER_COMMAND } from './messages';
import { startElementEraser } from './start';

export const elementEraser: Feature = {
  id: 'element-eraser',
  name: '元素擦除',
  description: '点选临时隐藏页面元素（弹窗、广告、侧边栏等），支持撤销与恢复，方便阅读、打印或截图清场',
  contextMenus: [
    {
      id: 'start',
      title: '元素擦除（临时隐藏）',
      contexts: ['page', 'link', 'image', 'selection', 'video', 'audio', 'editable'],
      onClick: (_info, tab) => {
        if (tab?.id != null) return startElementEraser(tab.id);
      },
    },
  ],
  commands: [
    {
      name: ELEMENT_ERASER_COMMAND,
      onCommand: (tab) => {
        if (tab?.id != null) return startElementEraser(tab.id);
      },
    },
  ],
};
