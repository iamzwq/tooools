export const CSS_INSPECTOR_START = 'css-inspector:start';
/** Content script -> background: fetch an image without page CORS limits, reply with a data URL or null. */
export const CSS_INSPECTOR_FETCH_IMAGE = 'css-inspector:fetch-image';

export interface FetchImageMessage {
  type: typeof CSS_INSPECTOR_FETCH_IMAGE;
  url: string;
}
