import type { Feature } from '@/features/types';
import { LAYOUT_XRAY_COMMAND } from './messages';
import { toggleLayoutXray } from './toggle';

export const layoutXray: Feature = {
  id: 'layout-xray',
  name: '布局透视',
  description: '按 DOM 嵌套层级高亮页面所有元素边界，快速排查排版、对齐与溢出问题',
  contextMenus: [
    {
      id: 'toggle',
      title: '布局透视（开/关）',
      contexts: ['page', 'link', 'image', 'selection', 'video', 'audio', 'editable'],
      onClick: async (_info, tab) => {
        if (tab?.id != null) await toggleLayoutXray(tab.id);
      },
    },
  ],
  commands: [
    {
      name: LAYOUT_XRAY_COMMAND,
      onCommand: async (tab) => {
        if (tab?.id != null) await toggleLayoutXray(tab.id);
      },
    },
  ],
};
