import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

/** The browser's own page for rebinding extension shortcuts (extensions can't change them in Chrome). */
export async function openShortcutSettings(): Promise<void> {
  const commands = browser.commands as typeof browser.commands & { openShortcutSettings?: () => Promise<void> };
  if (commands.openShortcutSettings) return commands.openShortcutSettings();
  const url = navigator.userAgent.includes('Edg/') ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';
  await browser.tabs.create({ url });
}

export function ShortcutRow({ command }: { command: string }) {
  const [shortcut, setShortcut] = useState<string | null>(null);

  useEffect(() => {
    void browser.commands.getAll().then((all) => {
      setShortcut(all.find((c) => c.name === command)?.shortcut ?? '');
    });
  }, [command]);

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
