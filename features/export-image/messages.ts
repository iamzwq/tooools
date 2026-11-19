export const EXPORT_IMAGE_RASTERIZE = 'export-image:rasterize';

export type ExportFormat = 'original' | 'png' | 'jpeg' | 'webp';
export type EncodeFormat = Exclude<ExportFormat, 'original'>;

/** Background -> offscreen document: rasterize an SVG (service workers can't decode SVG). */
export interface RasterizeMessage {
  type: typeof EXPORT_IMAGE_RASTERIZE;
  dataUrl: string;
  format: EncodeFormat;
  quality: number;
  background: string;
}

export type RasterizeResponse = { dataUrl: string } | { error: string };
