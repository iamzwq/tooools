export const IMAGE_TARGET_RESOLVE = 'image-target:resolve';

export interface ImageCandidate {
  /** http(s) or data: URL. */
  url: string;
  /** File name without extension; derived from the URL when omitted. */
  fileName?: string;
}

/** Background -> content script (frame where the right-click happened). */
export interface ResolveMessage {
  type: typeof IMAGE_TARGET_RESOLVE;
  /** `info.srcUrl` from the context menu, if the browser detected an image. */
  srcUrl?: string;
}

export interface ResolveResponse {
  candidates: ImageCandidate[];
}
