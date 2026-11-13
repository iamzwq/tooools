import type { Feature } from './types';
import { cssInspector } from './css-inspector';
import { saveImageTo123Pan } from './save-image-to-123pan';

/** Register new features here. */
export const features: Feature[] = [saveImageTo123Pan, cssInspector];
