import { useEffect, useState } from 'react';
import { Settings2, Sparkles } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { getAiModelSettings, isAiModelConfigured, type AiModelSettings } from '@/lib/ai/settings';
import { cn } from '@/lib/utils';
import { notify } from '@/utils/notify';
import { openOptionsPage } from '@/utils/options-page';
import { parseVideoUrl } from './sites';
import { openVideoSummary } from './start';

/** Row button: summarize the video in the current tab. */
export function VideoSummaryAction() {
  const [tab, setTab] = useState<{ id: number; supported: boolean } | null>(null);

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      if (t?.id != null) setTab({ id: t.id, supported: !!(t.url && parseVideoUrl(t.url)) });
    });
  }, []);

  async function open() {
    if (!tab?.supported) return;
    try {
      await openVideoSummary(tab.id);
      window.close();
    } catch (err) {
      await notify('视频 AI 总结', err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className="size-7"
      disabled={!tab?.supported}
      onClick={() => void open()}
      title={tab?.supported ? '总结当前视频' : '在 B站 / YouTube 视频页可用'}
      aria-label="总结当前视频"
    >
      <Sparkles />
    </Button>
  );
}

export default function VideoSummaryOptions() {
  const [ai, setAi] = useState<AiModelSettings | null>(null);

  useEffect(() => {
    void getAiModelSettings().then(setAi);
  }, []);

  if (!ai) return null;

  const configured = isAiModelConfigured(ai);

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn('size-1.5 shrink-0 rounded-full', configured ? 'bg-emerald-500' : 'bg-amber-500')} />
        <span className="truncate text-muted-foreground" title={configured ? `${ai.baseUrl} · ${ai.model}` : undefined}>
          {configured ? `AI 模型：${ai.model}` : '还没有填写 API Key'}
        </span>
      </span>
      <Button size="xs" variant="outline" onClick={() => void openOptionsPage('ai').then(() => window.close())}>
        <Settings2 />
        AI 设置
      </Button>
    </div>
  );
}
