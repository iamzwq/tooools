import { storage } from 'wxt/utils/storage';

export interface ExportImageSettings {
  /** JPG/WebP quality, 1–100. */
  quality: number;
  /** Fill color for transparent pixels when exporting to JPG. */
  jpegBackground: string;
  /** Always show the "Save as" dialog. */
  saveAs: boolean;
  /** Show a 「复制」 button on images under the mouse. */
  hoverCopy: boolean;
  /** Sites (with their subdomains) where the hover button stays hidden. */
  hoverCopyBlockedSites: string[];
}

export const DEFAULT_EXPORT_IMAGE_SETTINGS: ExportImageSettings = {
  quality: 92,
  jpegBackground: '#ffffff',
  saveAs: false,
  hoverCopy: true,
  hoverCopyBlockedSites: [],
};

export const exportImageSettingsItem = storage.defineItem<Partial<ExportImageSettings>>('sync:exportImageSettings', {
  fallback: {},
});

export async function getExportImageSettings(): Promise<ExportImageSettings> {
  return { ...DEFAULT_EXPORT_IMAGE_SETTINGS, ...(await exportImageSettingsItem.getValue()) };
}
