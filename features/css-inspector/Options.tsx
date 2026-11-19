import { useEffect, useState } from 'react';
import { Keyboard, MousePointerClick } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { CSS_INSPECTOR_COMMAND } from './messages';
import { startCssInspector } from './start';

/** The browser's own page for rebinding extension shortcuts (extensions can't change them in Chrome). */
async function openShortcutSettings(): Promise<void> {
  const commands = browser.commands as typeof browser.commands & { openShortcutSettings?: () => Promise<void> };
  if (commands.openShortcutSettings) return commands.openShortcutSettings();
  const url = navigator.userAgent.includes('Edg/') ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';
  await browser.tabs.create({ url });
}

export default function CssInspectorOptions() {
  const [error, setError] = useState('');
  const [shortcut, setShortcut] = useState<string | null>(null);

  useEffect(() => {
    void browser.commands.getAll().then((all) => {
      setShortcut(all.find((c) => c.name === CSS_INSPECTOR_COMMAND)?.shortcut ?? '');
    });
  }, []);

  async function start() {
    setError('');
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) throw new Error('找不到当前标签页');
      await startCssInspector(tab.id);
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function editShortcut() {
    try {
      await openShortcutSettings();
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" onClick={start}>
        <MousePointerClick />
        开始选取元素
      </Button>
      {shortcut !== null && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            快捷键：
            {shortcut ? (
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{shortcut}</kbd>
            ) : (
              '未设置'
            )}
          </span>
          <Button variant="outline" size="sm" onClick={editShortcut}>
            <Keyboard />
            修改
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
