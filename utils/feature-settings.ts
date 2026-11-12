import { storage } from 'wxt/utils/storage';
import type { Feature } from '@/features/types';

const enabledMap = storage.defineItem<Record<string, boolean>>('local:featureEnabled', {
  fallback: {},
});

export function isFeatureEnabled(feature: Feature, map: Record<string, boolean>): boolean {
  return map[feature.id] ?? feature.defaultEnabled ?? true;
}

export async function getFeatureEnabledMap(): Promise<Record<string, boolean>> {
  return enabledMap.getValue();
}

export async function setFeatureEnabled(featureId: string, enabled: boolean): Promise<void> {
  const map = await enabledMap.getValue();
  await enabledMap.setValue({ ...map, [featureId]: enabled });
}

export function watchFeatureEnabled(cb: () => void): () => void {
  return enabledMap.watch(cb);
}
