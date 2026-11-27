import type { ComponentType } from 'react';
import {
  Bot,
  CloudUpload,
  CodeXml,
  Eraser,
  ImageDown,
  Layers,
  MousePointerBan,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import AssistantOptions from './assistant/Options';
import CssInspectorOptions, { CssInspectorAction } from './css-inspector/Options';
import ElementEraserOptions, { ElementEraserAction } from './element-eraser/Options';
import ExportImageOptions from './export-image/Options';
import LayoutXrayOptions, { LayoutXrayAction } from './layout-xray/Options';
import Pan123Options from './save-image-to-123pan/Options';
import VideoSummaryOptions, { VideoSummaryAction } from './video-summary/Options';

export interface FeaturePopup {
  icon: LucideIcon;
  /** Tailwind classes for the colored icon tile. */
  tile: string;
  /** Collapsible settings. */
  Options?: ComponentType;
  /** One-click action shown on the row (e.g. "start"). */
  Action?: ComponentType;
}

/** Popup-only: feature id -> icon, color and settings UI. Register new features here. */
export const featurePopup: Partial<Record<string, FeaturePopup>> = {
  assistant: { icon: Bot, tile: 'bg-gradient-to-br from-indigo-400 to-violet-600', Options: AssistantOptions },
  'video-summary': {
    icon: Sparkles,
    tile: 'bg-gradient-to-br from-violet-500 to-indigo-500',
    Options: VideoSummaryOptions,
    Action: VideoSummaryAction,
  },
  'youtube-hover-preview': { icon: MousePointerBan, tile: 'bg-red-500' },
  'export-image': { icon: ImageDown, tile: 'bg-violet-500', Options: ExportImageOptions },
  'save-image-to-123pan': { icon: CloudUpload, tile: 'bg-sky-500', Options: Pan123Options },
  'css-inspector': { icon: CodeXml, tile: 'bg-amber-500', Options: CssInspectorOptions, Action: CssInspectorAction },
  'layout-xray': { icon: Layers, tile: 'bg-emerald-500', Options: LayoutXrayOptions, Action: LayoutXrayAction },
  'element-eraser': { icon: Eraser, tile: 'bg-rose-500', Options: ElementEraserOptions, Action: ElementEraserAction },
};
