export const CSS_INSPECTOR_START = 'css-inspector:start';
/** Keyboard shortcut command (declared in wxt.config.ts manifest `commands`). */
export const CSS_INSPECTOR_COMMAND = 'css-inspector-start';
/** Alt+C would be nicer, but Edge refuses to assign it to extensions. */
export const CSS_INSPECTOR_DEFAULT_SHORTCUT = 'Alt+K';
/** Content script -> background: fetch an image without page CORS limits, reply with a data URL or null. */
export const CSS_INSPECTOR_FETCH_IMAGE = 'css-inspector:fetch-image';

export interface FetchImageMessage {
  type: typeof CSS_INSPECTOR_FETCH_IMAGE;
  url: string;
}
