import { MousePointerClick } from 'lucide-react';
import { browser } from 'wxt/browser';
import { ShortcutRow } from '@/components/ShortcutRow';
import { Button } from '@/components/ui/button';
import { notify } from '@/utils/notify';
import { CSS_INSPECTOR_COMMAND } from './messages';
import { startCssInspector } from './start';

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
  return <ShortcutRow command={CSS_INSPECTOR_COMMAND} />;
}
