import { browser, type Browser } from 'wxt/browser';

/** True in a content script left behind by an extension update or reload: it can no longer reach the extension. */
export const isExtensionContextLost = (): boolean => !browser.runtime?.id;

/**
 * Handles one message type and replies with the handler's result.
 *
 * Several contexts (content scripts, background, offscreen) listen on the same channel. Only the
 * listener for the message's `type` responds; others stay silent so they never answer for it.
 */
export function onMessage<M extends { type: string }, R>(
  type: M['type'],
  handler: (message: M, sender: Browser.runtime.MessageSender) => R | Promise<R>,
): () => void {
  const listener = (message: unknown, sender: Browser.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    if ((message as { type?: unknown } | null)?.type !== type) return;
    Promise.resolve()
      .then(() => handler(message as M, sender))
      .then(sendResponse, (err) => {
        console.error(`[tooools] ${type} failed`, err);
        sendResponse(undefined);
      });
    return true;
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
