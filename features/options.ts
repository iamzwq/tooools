import type { ComponentType } from 'react';
import { CloudUpload, CodeXml, ImageDown, Layers, type LucideIcon } from 'lucide-react';
import CssInspectorOptions, { CssInspectorAction } from './css-inspector/Options';
import ExportImageOptions from './export-image/Options';
import LayoutXrayOptions, { LayoutXrayAction } from './layout-xray/Options';
import Pan123Options from './save-image-to-123pan/Options';

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
  'export-image': { icon: ImageDown, tile: 'bg-violet-500', Options: ExportImageOptions },
  'save-image-to-123pan': { icon: CloudUpload, tile: 'bg-sky-500', Options: Pan123Options },
  'css-inspector': { icon: CodeXml, tile: 'bg-amber-500', Options: CssInspectorOptions, Action: CssInspectorAction },
  'layout-xray': { icon: Layers, tile: 'bg-emerald-500', Options: LayoutXrayOptions, Action: LayoutXrayAction },
};
