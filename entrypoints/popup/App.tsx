import { useEffect, useState } from 'react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { features } from '@/features';
import { featureOptions } from '@/features/options';
import type { Feature } from '@/features/types';
import { getFeatureEnabledMap, isFeatureEnabled, setFeatureEnabled } from '@/utils/feature-settings';

export default function App() {
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    void getFeatureEnabledMap().then(setEnabledMap);
  }, []);

  if (!enabledMap) return null;

  const toggle = async (feature: Feature, enabled: boolean) => {
    setEnabledMap((m) => ({ ...m, [feature.id]: enabled }));
    await setFeatureEnabled(feature.id, enabled);
  };

  return (
    <div className="flex w-90 flex-col gap-3 px-3 pb-3">
      {features.map((feature) => {
        const enabled = isFeatureEnabled(feature, enabledMap);
        const Options = featureOptions[feature.id];
        return (
          <Card key={feature.id} className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle>{feature.name}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
              <CardAction>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => toggle(feature, checked)}
                  aria-label={`启用${feature.name}`}
                />
              </CardAction>
            </CardHeader>
            {enabled && Options && (
              <CardContent className="px-4">
                <Options />
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}