import { storage } from 'wxt/utils/storage';

export interface CachedSummary {
  markdown: string;
  model: string;
  trackLabel: string;
  createdAt: number;
}

const MAX_ENTRIES = 60;

/** `${site}:${video key}` -> latest summary. */
const summaryCacheItem = storage.defineItem<Record<string, CachedSummary>>('local:videoSummaryCache', {
  fallback: {},
});

export function summaryCacheKey(site: string, videoKey: string): string {
  return `${site}:${videoKey}`;
}

export async function getCachedSummary(key: string): Promise<CachedSummary | null> {
  return (await summaryCacheItem.getValue())[key] ?? null;
}

export async function saveCachedSummary(key: string, summary: CachedSummary): Promise<void> {
  const all = { ...(await summaryCacheItem.getValue()), [key]: summary };
  const keys = Object.keys(all);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (all[a]?.createdAt ?? 0) - (all[b]?.createdAt ?? 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete all[k]);
  }
  await summaryCacheItem.setValue(all);
}

export async function countCachedSummaries(): Promise<number> {
  return Object.keys(await summaryCacheItem.getValue()).length;
}

export async function clearSummaryCache(): Promise<void> {
  await summaryCacheItem.setValue({});
}
