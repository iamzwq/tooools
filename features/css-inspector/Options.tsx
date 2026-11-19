import { useEffect, useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { notify } from '@/utils/notify';
import { CSS_INSPECTOR_COMMAND } from './messages';
import { startCssInspector } from './start';

/** The browser's own page for rebinding extension shortcuts (extensions can't change them in Chrome). */
async function openShortcutSettings(): Promise<void> {
  const commands = browser.commands as typeof browser.commands & { openShortcutSettings?: () => Promise<void> };
  if (commands.openShortcutSettings) return commands.openShortcutSettings();
  const url = navigator.userAgent.includes('Edg/') ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';
  await browser.tabs.create({ url });
}

/** Row button: start picking an element on the current tab. */
export function CssInspectorAction() {
  async function start() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) throw new Error('找不到当前标签页');
      await startCssInspector(tab.id);
      window.close();
    } catch (err) {
      await notify('检查元素 CSS', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Button size="icon-sm" variant="ghost" className="size-7" onClick={start} title="开始选取元素" aria-label="开始选取元素">
      <MousePointerClick />
    </Button>
  );
}

export default function CssInspectorOptions() {
  const [shortcut, setShortcut] = useState<string | null>(null);

  useEffect(() => {
    void browser.commands.getAll().then((all) => {
      setShortcut(all.find((c) => c.name === CSS_INSPECTOR_COMMAND)?.shortcut ?? '');
    });
  }, []);

  if (shortcut === null) return null;

  return (
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
  );
}
