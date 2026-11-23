import { useEffect, useState } from 'react';
import { Scan } from 'lucide-react';
import { browser } from 'wxt/browser';
import { ShortcutRow } from '@/components/ShortcutRow';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { cn } from '@/lib/utils';
import { notify } from '@/utils/notify';
import { LAYOUT_XRAY_COMMAND } from './messages';
import { getLayoutXraySettings, layoutXraySettingsItem, type LayoutXrayMode } from './settings';
import { isLayoutXrayActive, toggleLayoutXray, updateLayoutXray } from './toggle';

const MODES: { value: LayoutXrayMode; label: string }[] = [
  { value: 'outline', label: '描边' },
  { value: 'tint', label: '填色' },
  { value: 'both', label: '混合' },
];

/** Row button: toggle layout X-ray on the current tab. */
export function LayoutXrayAction() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id != null) void isLayoutXrayActive(tab.id).then(setActive);
    });
  }, []);

  async function toggle() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) throw new Error('找不到当前标签页');
      const next = await toggleLayoutXray(tab.id);
      setActive(next);
    } catch (err) {
      await notify('布局透视', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Button
      size="icon-sm"
      variant={active ? 'secondary' : 'ghost'}
      className={cn('size-7', active && 'text-emerald-600 dark:text-emerald-400')}
      onClick={toggle}
      title={active ? '关闭当前页布局透视' : '开启当前页布局透视'}
      aria-label={active ? '关闭布局透视' : '开启布局透视'}
      aria-pressed={active}
    >
      <Scan />
    </Button>
  );
}

export default function LayoutXrayOptions() {
  const [mode, setMode] = useState<LayoutXrayMode | null>(null);

  useEffect(() => {
    void getLayoutXraySettings().then((s) => setMode(s.mode));
  }, []);

  if (!mode) return null;

  async function selectMode(next: LayoutXrayMode) {
    setMode(next);
    await layoutXraySettingsItem.setValue({ mode: next });
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await updateLayoutXray(tab.id, next);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">透视模式</span>
        <ButtonGroup>
          {MODES.map((item) => (
            <Button
              key={item.value}
              type="button"
              size="xs"
              variant={mode === item.value ? 'default' : 'outline'}
              onClick={() => void selectMode(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </ButtonGroup>
      </div>
      <ShortcutRow command={LAYOUT_XRAY_COMMAND} />
    </div>
  );
}
