import { browser } from 'wxt/browser';

/** Shows (or updates, when the same id is reused) a system notification. */
export async function notify(title: string, message: string, id?: string): Promise<string> {
  const notificationId = id ?? `tooools-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (id) await browser.notifications.clear(id);
  await browser.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title,
    message,
  });
  return notificationId;
}
