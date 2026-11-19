import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { features } from '@/features';
import { featurePopup } from '@/features/options';
import type { Feature } from '@/features/types';
import { getFeatureEnabledMap, isFeatureEnabled, setFeatureEnabled } from '@/utils/feature-settings';
import { cn } from '@/lib/utils';

export default function App() {
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean> | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void getFeatureEnabledMap().then(setEnabledMap);
  }, []);

  if (!enabledMap) return null;

  const toggle = async (feature: Feature, enabled: boolean) => {
    setEnabledMap((m) => ({ ...m, [feature.id]: enabled }));
    if (!enabled && open === feature.id) setOpen(null);
    await setFeatureEnabled(feature.id, enabled);
  };

  return (
    <div className="flex w-72 flex-col gap-2 px-2 pb-4.5">
      <ul className="overflow-hidden rounded-xl border bg-card">
        {features.map((feature) => {
          const enabled = isFeatureEnabled(feature, enabledMap);
          const popup = featurePopup[feature.id];
          const Icon = popup?.icon;
          const expandable = enabled && !!popup?.Options;
          const expanded = expandable && open === feature.id;
          return (
            <li key={feature.id} className="border-b last:border-b-0">
              <div className="flex h-11 items-center gap-2.5 px-2.5">
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-lg text-white transition',
                    popup?.tile ?? 'bg-neutral-500',
                    !enabled && 'opacity-35 grayscale',
                  )}
                >
                  {Icon && <Icon className="size-4" />}
                </span>
                <button
                  type="button"
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-medium',
                    !enabled && 'text-muted-foreground',
                    !expandable && 'cursor-default',
                  )}
                  title={feature.description}
                  onClick={() => expandable && setOpen(expanded ? null : feature.id)}
                  aria-expanded={expandable ? expanded : undefined}
                >
                  <span className="truncate">{feature.name}</span>
                  {expandable && (
                    <ChevronDown
                      className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
                    />
                  )}
                </button>
                {enabled && popup?.Action && <popup.Action />}
                <Switch
                  size="sm"
                  checked={enabled}
                  onCheckedChange={(checked) => toggle(feature, checked)}
                  aria-label={`启用${feature.name}`}
                />
              </div>
              {expanded && popup?.Options && (
                <div className="bg-muted/40 px-3 py-2.5 text-xs">
                  <popup.Options />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
