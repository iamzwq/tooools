import type { Feature } from '@/features/types';
import { setupVideoSummaryBackground } from './background';
import { VIDEO_SUMMARY_FEATURE_ID } from './messages';

export const videoSummary: Feature = {
  id: VIDEO_SUMMARY_FEATURE_ID,
  name: '视频 AI 总结',
  description: '在 B站 / YouTube 视频页一键提取字幕，用 AI 生成带时间戳的要点总结，点击时间戳即可跳转（通过小T 或弹窗里的 ✨ 按钮使用）',
  setupBackground: setupVideoSummaryBackground,
};
