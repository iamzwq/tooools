import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';

export interface Pan123Auth {
  token: string;
  /** Origin of the 123pan site the token came from, e.g. https://www.123pan.com */
  origin: string;
  updatedAt: number;
}

/** Hostnames used by 123云盘's web app. */
export const PAN123_DOMAINS = ['123pan.com', '123pan.cn', '123865.com', '123684.com', '123912.com'];
export const PAN123_MATCHES = PAN123_DOMAINS.map((d) => `*://*.${d}/*`);
export const PAN123_HOME = 'https://www.123pan.com/';

export const pan123AuthItem = storage.defineItem<Pan123Auth | null>('local:pan123Auth', {
  fallback: null,
});

export const pan123FolderItem = storage.defineItem<string>('sync:pan123FolderName', {
  fallback: '网页图片',
});

/** The web app keeps the token in localStorage, sometimes JSON-encoded. */
export function normalizeToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let token = raw.trim();
  try {
    const parsed = JSON.parse(token);
    if (typeof parsed === 'string') token = parsed;
  } catch {
    // plain string
  }
  return token || null;
}

/**
 * Returns the stored token; if missing, tries to read it from any open 123pan tab.
 */
export async function getPan123Auth(): Promise<Pan123Auth | null> {
  const stored = await pan123AuthItem.getValue();
  if (stored?.token) return stored;
  return refreshAuthFromOpenTabs();
}

export async function refreshAuthFromOpenTabs(): Promise<Pan123Auth | null> {
  const tabs = await browser.tabs.query({ url: PAN123_MATCHES });
  for (const tab of tabs) {
    if (tab.id == null) continue;
    try {
      const [result] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ token: localStorage.getItem('authorToken'), origin: location.origin }),
      });
      const value = result?.result as { token: string | null; origin: string } | undefined;
      const token = normalizeToken(value?.token);
      if (token && value) {
        const auth: Pan123Auth = { token, origin: value.origin, updatedAt: Date.now() };
        await pan123AuthItem.setValue(auth);
        return auth;
      }
    } catch {
      // Tab may be discarded or not scriptable; try the next one.
    }
  }
  return null;
}
