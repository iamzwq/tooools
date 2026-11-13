import { useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { startCssInspector } from './start';

export default function CssInspectorOptions() {
  const [error, setError] = useState('');

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

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" onClick={start}>
        <MousePointerClick />
        开始选取元素
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
