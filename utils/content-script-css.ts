import { browser } from 'wxt/browser';
import { onMessage } from './messaging';

/** Content script → background: replies with the text of `content-scripts/<name>.css`, or null. */
const CONTENT_SCRIPT_CSS = 'tooools:content-script-css';

/**
 * The stylesheet of this content script's UI, ready for its shadow root.
 *
 * The background reads the file. A content script fetching it itself goes through the page, so on
 * sites with their own service worker (e.g. YouTube) Chromium reports "Unsafe attempt to load URL
 * chrome-extension://…" for it, which fills the extension's error page even though the styles load.
 */
export async function loadContentScriptCss(name = import.meta.env.ENTRYPOINT): Promise<string> {
  let css: unknown;
  try {
    css = await browser.runtime.sendMessage({ type: CONTENT_SCRIPT_CSS, name });
  } catch {
    css = undefined;
  }
  if (typeof css !== 'string') {
    console.warn(`[tooools] styles for ${name} could not be loaded`);
    return '';
  }
  // As in WXT's own loader: variables declared for the page belong to the shadow host.
  return css.replaceAll(':root', ':host');
}

export function setupContentScriptCssBackground() {
  onMessage<{ type: typeof CONTENT_SCRIPT_CSS; name: string }, string | null>(CONTENT_SCRIPT_CSS, async ({ name }) => {
    if (!/^[\w-]+$/.test(name)) return null;
    const res = await fetch(browser.runtime.getURL(`/content-scripts/${name}.css` as Parameters<typeof browser.runtime.getURL>[0]));
    return res.ok ? res.text() : null;
  });
}
