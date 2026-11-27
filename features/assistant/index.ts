import type { Feature } from '@/features/types';
import { setupAssistantBackground } from './background';
import { ASSISTANT_FEATURE_ID } from './messages';

export const assistant: Feature = {
  id: ASSISTANT_FEATURE_ID,
  name: '小T 悬浮助手',
  description: '在网页边缘显示悬浮小助手：点击打开工具菜单，视频页可一键 AI 总结；右键可临时隐藏，也可设置不显示的网站',
  setupBackground: setupAssistantBackground,
};
