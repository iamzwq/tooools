import type { Feature } from './types';
import { cssInspector } from './css-inspector';
import { elementEraser } from './element-eraser';
import { exportImageFeature } from './export-image';
import { layoutXray } from './layout-xray';
import { saveImageTo123Pan } from './save-image-to-123pan';

/** Register new features here. */
export const features: Feature[] = [exportImageFeature, saveImageTo123Pan, cssInspector, layoutXray, elementEraser];
