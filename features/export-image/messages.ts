export const EXPORT_IMAGE_RESOLVE = 'export-image:resolve';
export const EXPORT_IMAGE_RASTERIZE = 'export-image:rasterize';

export type ExportFormat = 'original' | 'png' | 'jpeg' | 'webp';
export type EncodeFormat = Exclude<ExportFormat, 'original'>;

export interface ImageCandidate {
  /** http(s) or data: URL. */
  url: string;
  /** File name without extension; derived from the URL when omitted. */
  fileName?: string;
}

/** Background -> content script (frame where the right-click happened). */
export interface ResolveMessage {
  type: typeof EXPORT_IMAGE_RESOLVE;
  /** `info.srcUrl` from the context menu, if the browser detected an image/video. */
  srcUrl?: string;
}

export interface ResolveResponse {
  candidates: ImageCandidate[];
}

/** Background -> offscreen document: rasterize an SVG (service workers can't decode SVG). */
export interface RasterizeMessage {
  type: typeof EXPORT_IMAGE_RASTERIZE;
  dataUrl: string;
  format: EncodeFormat;
  quality: number;
  background: string;
}

export type RasterizeResponse = { dataUrl: string } | { error: string };
