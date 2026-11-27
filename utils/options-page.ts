import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';

export type OptionsSection = 'assistant' | 'ai' | 'video-summary';

/** Section the options page scrolls to when it opens; the page clears it after reading. */
export const optionsSectionItem = storage.defineItem<OptionsSection | null>('local:optionsSection', {
  fallback: null,
});

/** Opens (or focuses) the options page at `section`. Content scripts must ask the background to call this. */
export async function openOptionsPage(section?: OptionsSection): Promise<void> {
  await optionsSectionItem.setValue(section ?? null);
  await browser.runtime.openOptionsPage();
}
