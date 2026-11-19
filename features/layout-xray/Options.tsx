import { useEffect, useState } from 'react';
import { Scan } from 'lucide-react';
import { browser } from 'wxt/browser';
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

async function openShortcutSettings(): Promise<void> {
  const commands = browser.commands as typeof browser.commands & { openShortcutSettings?: () => Promise<void> };
  if (commands.openShortcutSettings) return commands.openShortcutSettings();
  const url = navigator.userAgent.includes('Edg/') ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';
  await browser.tabs.create({ url });
}

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
  const [shortcut, setShortcut] = useState<string | null>(null);

  useEffect(() => {
    void getLayoutXraySettings().then((s) => setMode(s.mode));
    void browser.commands.getAll().then((all) => {
      setShortcut(all.find((c) => c.name === LAYOUT_XRAY_COMMAND)?.shortcut ?? '');
    });
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
      {shortcut !== null && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">快捷键</span>
          <button
            type="button"
            className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-foreground hover:bg-accent"
            onClick={() => void openShortcutSettings().then(() => window.close())}
            title="在浏览器快捷键设置中修改"
          >
            {shortcut || '未设置'}
          </button>
        </div>
      )}
    </div>
  );
}
