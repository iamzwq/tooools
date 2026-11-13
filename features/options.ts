import type { ComponentType } from 'react';
import CssInspectorOptions from './css-inspector/Options';
import Pan123Options from './save-image-to-123pan/Options';

/** Popup-only: feature id -> React settings component. Register new feature settings here. */
export const featureOptions: Partial<Record<string, ComponentType>> = {
  'save-image-to-123pan': Pan123Options,
  'css-inspector': CssInspectorOptions,
};
