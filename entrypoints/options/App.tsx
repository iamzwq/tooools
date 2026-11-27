import { useEffect, useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { browser } from 'wxt/browser';
import { cn } from '@/lib/utils';
import { optionsSectionItem, type OptionsSection } from '@/utils/options-page';
import { AiModelSection } from './AiModelSection';
import { AssistantSection } from './AssistantSection';
import { VideoSummarySection } from './VideoSummarySection';

function Section({ id, highlight, children }: { id: OptionsSection; highlight: boolean; children: ReactNode }) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-6 rounded-xl transition-shadow duration-500',
        highlight && 'ring-2 ring-indigo-500/60 ring-offset-4 ring-offset-muted',
      )}
    >
      {children}
    </section>
  );
}

export default function App() {
  const [highlight, setHighlight] = useState<OptionsSection | null>(null);

  // Opened from 小T, the popup or the summary panel: jump to the section asked for.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const focus = async () => {
      const section = await optionsSectionItem.getValue();
      if (!section) return;
      await optionsSectionItem.setValue(null);
      clearTimeout(timer);
      setHighlight(section);
      // Sections render once their settings have loaded.
      setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      timer = setTimeout(() => setHighlight(null), 1800);
    };
    void focus();
    const unwatch = optionsSectionItem.watch(() => void focus());
    return () => {
      unwatch();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10">
        <header className="flex items-center gap-3">
          <img src={browser.runtime.getURL('/icon/128.png')} alt="" className="size-10 rounded-xl" />
          <div>
            <h1 className="text-xl font-semibold">Tooools 设置</h1>
            <p className="text-sm text-muted-foreground">小T 悬浮助手、AI 模型与视频总结</p>
          </div>
        </header>

        <Section id="assistant" highlight={highlight === 'assistant'}>
          <AssistantSection />
        </Section>
        <Section id="ai" highlight={highlight === 'ai'}>
          <AiModelSection />
        </Section>
        <Section id="video-summary" highlight={highlight === 'video-summary'}>
          <VideoSummarySection />
        </Section>

        <footer className="flex items-start gap-2 px-1 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          <span>
            API Key 只保存在本机浏览器中。生成总结时，视频的标题、简介和字幕会发送给你配置的 AI 服务商，不经过任何其他服务器。
          </span>
        </footer>
      </div>
    </div>
  );
}
