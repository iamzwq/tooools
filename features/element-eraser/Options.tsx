import { useEffect, useState } from 'react';
import { Eraser, RotateCcw } from 'lucide-react';
import { browser } from 'wxt/browser';
import { ShortcutRow } from '@/components/ShortcutRow';
import { Button } from '@/components/ui/button';
import { notify } from '@/utils/notify';
import { ELEMENT_ERASER_COMMAND } from './messages';
import { getElementEraserCount, restoreElementEraser, startElementEraser } from './start';

/** Row button: start erasing elements on the current tab. */
export function ElementEraserAction() {
  async function start() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) throw new Error('找不到当前标签页');
      await startElementEraser(tab.id);
      window.close();
    } catch (err) {
      await notify('元素擦除', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Button size="icon-sm" variant="ghost" className="size-7" onClick={start} title="开始擦除元素" aria-label="开始擦除元素">
      <Eraser />
    </Button>
  );
}

export default function ElementEraserOptions() {
  const [hiddenCount, setHiddenCount] = useState(0);

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id != null) void getElementEraserCount(tab.id).then(setHiddenCount);
    });
  }, []);

  async function restore() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    await restoreElementEraser(tab.id);
    setHiddenCount(0);
  }

  return (
    <div className="flex flex-col gap-2">
      <ShortcutRow command={ELEMENT_ERASER_COMMAND} />
      {hiddenCount > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">当前页已隐藏 {hiddenCount} 个元素</span>
          <Button size="xs" variant="outline" onClick={() => void restore()}>
            <RotateCcw />
            恢复全部
          </Button>
        </div>
      )}
    </div>
  );
}
