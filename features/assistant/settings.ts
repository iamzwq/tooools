import { storage } from 'wxt/utils/storage';
import { matchesSite } from './sites';

export interface AssistantSettings {
  /** Sites (with their subdomains) where 小T stays hidden. */
  blockedSites: string[];
}

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  blockedSites: [],
};

export const assistantSettingsItem = storage.defineItem<Partial<AssistantSettings>>('sync:assistantSettings', {
  fallback: {},
});

export async function getAssistantSettings(): Promise<AssistantSettings> {
  return { ...DEFAULT_ASSISTANT_SETTINGS, ...(await assistantSettingsItem.getValue()) };
}

async function setBlockedSites(update: (sites: string[]) => string[]): Promise<void> {
  const stored = await assistantSettingsItem.getValue();
  const current = stored.blockedSites ?? DEFAULT_ASSISTANT_SETTINGS.blockedSites;
  await assistantSettingsItem.setValue({ ...stored, blockedSites: update(current) });
}

export function blockSite(site: string): Promise<void> {
  return setBlockedSites((sites) => (sites.includes(site) ? sites : [...sites, site]));
}

export function unblockSite(site: string): Promise<void> {
  return setBlockedSites((sites) => sites.filter((s) => s !== site));
}

/** Removes every entry that hides 小T on `hostname` (the site itself or a parent domain). */
export function unblockHost(hostname: string): Promise<void> {
  return setBlockedSites((sites) => sites.filter((site) => !matchesSite(hostname, site)));
}

export interface MascotPosition {
  side: 'left' | 'right';
  /** Vertical position as a fraction of the free viewport height (0 = top, 1 = bottom). */
  y: number;
}

export const mascotPositionItem = storage.defineItem<MascotPosition | null>('local:assistantPosition', {
  fallback: null,
});

/** Set once 小T has introduced itself. */
export const mascotGreetedItem = storage.defineItem<boolean>('local:assistantGreeted', {
  fallback: false,
});

/** Set once 小T has pointed out video summaries on a video page. */
export const videoTipShownItem = storage.defineItem<boolean>('local:assistantVideoTipShown', {
  fallback: false,
});
