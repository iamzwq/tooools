import { storage } from 'wxt/utils/storage';

export type LayoutXrayMode = 'outline' | 'tint' | 'both';

export interface LayoutXraySettings {
  mode: LayoutXrayMode;
}

export const DEFAULT_LAYOUT_XRAY_SETTINGS: LayoutXraySettings = {
  mode: 'outline',
};

export const layoutXraySettingsItem = storage.defineItem<Partial<LayoutXraySettings>>('sync:layoutXraySettings', {
  fallback: {},
});

export async function getLayoutXraySettings(): Promise<LayoutXraySettings> {
  return { ...DEFAULT_LAYOUT_XRAY_SETTINGS, ...(await layoutXraySettingsItem.getValue()) };
}
