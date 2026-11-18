import { storage } from 'wxt/utils/storage';

export interface ExportImageSettings {
  /** JPG/WebP quality, 1–100. */
  quality: number;
  /** Fill color for transparent pixels when exporting to JPG. */
  jpegBackground: string;
  /** Always show the "Save as" dialog. */
  saveAs: boolean;
}

export const DEFAULT_EXPORT_IMAGE_SETTINGS: ExportImageSettings = {
  quality: 92,
  jpegBackground: '#ffffff',
  saveAs: false,
};

export const exportImageSettingsItem = storage.defineItem<Partial<ExportImageSettings>>('sync:exportImageSettings', {
  fallback: {},
});

export async function getExportImageSettings(): Promise<ExportImageSettings> {
  return { ...DEFAULT_EXPORT_IMAGE_SETTINGS, ...(await exportImageSettingsItem.getValue()) };
}
