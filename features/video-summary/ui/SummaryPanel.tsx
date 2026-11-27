import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Check,
  CircleCheck,
  Copy,
  Loader2,
  LogIn,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { Mascot, type MascotMood } from '@/features/assistant/ui/Mascot';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { compactTranscript, formatTimestamp } from '../prompt';
import { Markdown } from './markdown';
import { seekVideo, useVideoTime } from './media';
import { isRunning, trackLabelOf, type AssistantState, type AssistantStore, type ErrorInfo, type SummaryState, type TranscriptState } from './store';

export type PanelTab = 'summary' | 'transcript';

interface Props {
  state: AssistantState;
  store: AssistantStore;
  tab: PanelTab;
  mood: MascotMood;
  title: string;
  style: CSSProperties;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  onSettings: () => void;
}

export async function copyText(text: string, container: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Clipboard API needs focus; fall back to a hidden textarea.
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  container.append(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function useCopied(): [boolean, (task: Promise<unknown>) => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  return [copied, (task) => void task.then(() => setCopied(true))];
}

function relativeTime(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

const ERROR_TITLES: Record<string, string> = {
  config: '先配置一下 AI 模型吧',
  login: '需要登录 B站',
  'no-subtitle': '这个视频没有字幕',
  'youtube-captions': '暂时拿不到 YouTube 字幕',
  unplayable: '视频暂时无法播放',
  unsupported: '暂不支持这个视频',
  'extension-updated': '扩展已更新',
  auth: 'API Key 无效',
  quota: '账户余额不足',
  'rate-limit': '请求太频繁了',
  'not-found': '找不到接口或模型',
  'bad-request': 'AI 服务拒绝了请求',
  server: 'AI 服务暂时不可用',
  network: '网络连接失败',
  empty: 'AI 没有返回内容',
};

const SETTINGS_ERRORS = new Set(['config', 'auth', 'quota', 'not-found', 'bad-request']);

function ErrorCard({ error, onRetry, onSettings }: { error: ErrorInfo; onRetry?: () => void; onSettings: () => void }) {
  const actions: ReactNode[] = [];
  if (SETTINGS_ERRORS.has(error.code)) {
    actions.push(
      <Button key="settings" size="sm" onClick={onSettings}>
        <Settings2 />
        打开 AI 设置
      </Button>,
    );
  }
  if (error.code === 'login') {
    // A real link: Enter opens it natively, and the page-script guard (which drops synthetic clicks) leaves it alone.
    actions.push(
      <a
        key="login"
        className={buttonVariants({ size: 'sm' })}
        href={`https://passport.bilibili.com/login?gourl=${encodeURIComponent(location.href)}`}
      >
        <LogIn />
        去登录
      </a>,
    );
  }
  if (error.code === 'extension-updated') {
    actions.push(
      <Button key="reload" size="sm" onClick={() => location.reload()}>
        <RefreshCw />
        刷新页面
      </Button>,
    );
  }
  if (onRetry && error.code !== 'config' && error.code !== 'extension-updated') {
    actions.push(
      <Button key="retry" size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw />
        重试
      </Button>,
    );
  }
  return (
    <div className="flex flex-col items-center gap-2.5 px-2 py-8 text-center">
      <Mascot mood={error.code === 'config' ? 'idle' : 'error'} className="size-14" />
      <div className="text-sm font-semibold">{ERROR_TITLES[error.code] ?? '出了点问题'}</div>
      <p className="max-w-[320px] text-xs leading-5 break-words text-muted-foreground">{error.message}</p>
      {actions.length > 0 && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
      <Mascot mood="happy" className="tva-float size-16" />
      <div className="text-sm font-semibold">一键看懂这个视频</div>
      <p className="max-w-[280px] text-xs leading-5 text-muted-foreground">
        小T 会读取视频字幕，用 AI 提炼要点并标注时间戳，点击时间戳就能跳到对应位置。
      </p>
      <Button className="mt-1 bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:brightness-110" onClick={onStart}>
        <Sparkles />
        开始总结
      </Button>
    </div>
  );
}

function Progress({ summary, onStop }: { summary: SummaryState; onStop: () => void }) {
  const step = summary.phase === 'transcript' ? 0 : summary.phase === 'writing' ? 2 : 1;
  const { chunk } = summary;
  const steps = [
    { label: '读取字幕', detail: summary.trackLabel },
    {
      label: !chunk ? 'AI 阅读字幕' : chunk.index < chunk.total ? `长视频分段整理（${chunk.index}/${chunk.total}）` : '汇总各段要点',
      detail: summary.reasoningChars ? `深度思考中，已思考 ${summary.reasoningChars.toLocaleString()} 字` : undefined,
    },
    { label: '生成总结' },
  ];
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-8">
      <Mascot mood="thinking" className="tva-float size-16" />
      <div className="text-sm font-medium">小T 正在认真看视频…</div>
      <ol className="flex w-full max-w-[260px] flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={i} className={cn('flex items-start gap-2.5 text-[13px]', i > step && 'text-muted-foreground')}>
            {i < step ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            ) : i === step ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-indigo-500" />
            ) : (
              <span className="mt-[5px] ml-[3px] size-2.5 shrink-0 rounded-full border-2 border-muted-foreground/40" />
            )}
            <span className="min-w-0">
              <span className={cn(i === step && 'font-medium')}>{s.label}</span>
              {s.detail && i <= step && <span className="block truncate text-[11px] text-muted-foreground">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={onStop}>
        <Square className="fill-current" />
        停止
      </Button>
    </div>
  );
}

function SummaryView({ store, summary, onSettings }: { store: AssistantStore; summary: SummaryState; onSettings: () => void }) {
  if (summary.phase === 'idle') return <StartScreen onStart={() => void store.summarize()} />;
  if (summary.phase === 'error' && summary.error) {
    return <ErrorCard error={summary.error} onRetry={() => void store.summarize({ force: true })} onSettings={onSettings} />;
  }
  if (isRunning(summary.phase) && !summary.markdown) return <Progress summary={summary} onStop={() => store.stop()} />;
  return (
    <div className="px-4 py-3">
      <Markdown text={summary.markdown} onSeek={seekVideo} streaming={summary.phase === 'writing'} />
      {summary.phase === 'writing' && (
        <div className="mt-3 flex justify-center">
          <Button size="xs" variant="outline" onClick={() => store.stop()}>
            <Square className="fill-current" />
            停止生成
          </Button>
        </div>
      )}
    </div>
  );
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const nodes: ReactNode[] = [];
  let from = 0;
  for (let i = lower.indexOf(query); i >= 0; i = lower.indexOf(query, i + query.length)) {
    nodes.push(text.slice(from, i), <mark key={i} className="rounded-sm bg-amber-300/60 text-inherit dark:bg-amber-400/40">{text.slice(i, i + query.length)}</mark>);
    from = i + query.length;
  }
  nodes.push(text.slice(from));
  return nodes;
}

function TranscriptView({
  store,
  transcript,
  onSettings,
  container,
}: {
  store: AssistantStore;
  transcript: TranscriptState;
  onSettings: () => void;
  container: HTMLElement | null;
}) {
  const [query, setQuery] = useState('');
  const [copied, markCopied] = useCopied();
  const listRef = useRef<HTMLDivElement>(null);
  const lastUserScroll = useRef(0);
  const ready = transcript.status === 'ready';
  const time = useVideoTime(ready && !query);

  useEffect(() => {
    if (transcript.status === 'idle') store.loadTranscript().catch(() => {});
  }, [store, transcript.status]);

  const lines = useMemo(() => compactTranscript(transcript.segments ?? [], 64, 18), [transcript.segments]);
  const q = query.trim().toLowerCase();
  const shown = q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : lines;
  let active = -1;
  if (!q)   for (let i = 0; i < lines.length && lines[i]!.start <= time + 0.3; i++) active = i;

  // Follow playback unless the user scrolled the list recently.
  useEffect(() => {
    if (active < 0 || Date.now() - lastUserScroll.current < 4000) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);

  if (transcript.status === 'error' && transcript.error) {
    return <ErrorCard error={transcript.error} onRetry={() => void store.loadTranscript().catch(() => {})} onSettings={onSettings} />;
  }
  if (!ready) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-xs text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-indigo-500" />
        正在读取字幕…
      </div>
    );
  }

  const tracks = transcript.video?.tracks ?? [];
  const copyAll = () =>
    markCopied(copyText(lines.map((l) => `[${formatTimestamp(l.start)}] ${l.text}`).join('\n'), container ?? document.body));

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-popover px-3 py-2">
        <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border bg-background px-2 focus-within:ring-2 focus-within:ring-indigo-500/30">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`搜索 ${lines.length} 行字幕`}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="清空搜索" className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </label>
        {tracks.length > 1 && (
          <select
            value={transcript.trackId}
            onChange={(e) => void store.loadTranscript(e.target.value).catch(() => {})}
            title="切换字幕"
            className="h-7 max-w-[110px] truncate rounded-md border bg-background px-1.5 text-xs outline-none"
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        <Button size="icon-xs" variant="ghost" className="size-7" onClick={copyAll} title="复制全部字幕" aria-label="复制全部字幕">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <div
        ref={listRef}
        className="flex flex-col px-1.5 py-1.5"
        onWheel={() => (lastUserScroll.current = Date.now())}
        onTouchMove={() => (lastUserScroll.current = Date.now())}
      >
        {shown.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">没有找到「{query}」</div>}
        {shown.map((line) => {
          const index = lines.indexOf(line);
          return (
            <button
              key={index}
              type="button"
              data-index={index}
              data-active={index === active}
              onClick={() => seekVideo(line.start)}
              className="flex w-full gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-muted data-[active=true]:bg-indigo-500/10"
            >
              <span className="w-12 shrink-0 pt-px font-mono text-[11px] text-indigo-500 tabular-nums dark:text-indigo-300">
                {formatTimestamp(line.start)}
              </span>
              <span className="min-w-0 flex-1 text-[13px] leading-5">{highlight(line.text, q)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SummaryPanel({ state, store, tab, mood, title, style, onTab, onClose, onSettings }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [copied, markCopied] = useCopied();
  const { summary, transcript } = state;
  const done = summary.phase === 'done';
  const running = isRunning(summary.phase);

  let meta = 'AI 生成的内容仅供参考';
  if (tab === 'transcript' && transcript.status === 'ready') {
    meta = `${trackLabelOf(transcript)} · ${transcript.segments?.length ?? 0} 条字幕`;
  } else if (running && summary.model) {
    meta = `${summary.model} · 生成中…`;
  } else if (done && summary.model) {
    const when = summary.cached && summary.createdAt ? `${relativeTime(summary.createdAt)}生成` : summary.elapsedMs ? `用时 ${Math.max(1, Math.round(summary.elapsedMs / 1000))} 秒` : '';
    meta = [summary.model, when, summary.trackLabel && `字幕：${summary.trackLabel}`].filter(Boolean).join(' · ');
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="AI 视频总结"
      className="pointer-events-auto fixed flex flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl animate-in fade-in zoom-in-[0.98] duration-200"
      style={style}
    >
      <div className="relative flex items-center gap-2.5 border-b px-3 py-2.5">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-400 via-indigo-500 to-sky-400" />
        <Mascot mood={mood} className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">AI 视频总结</div>
          <div className="truncate text-xs text-muted-foreground" title={title}>
            {title}
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} title="收起（Esc）" aria-label="收起面板">
          <X />
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        {(['summary', 'transcript'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onTab(key)}
            aria-pressed={tab === key}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition',
              tab === key ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {key === 'summary' ? '总结' : '字幕'}
          </button>
        ))}
        {tab === 'summary' && done && (
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              size="icon-xs"
              variant="ghost"
              className="size-7"
              onClick={() => markCopied(copyText(summary.markdown, rootRef.current ?? document.body))}
              title="复制总结（Markdown）"
              aria-label="复制总结"
            >
              {copied ? <Check /> : <Copy />}
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              className="size-7"
              onClick={() => void store.summarize({ force: true })}
              title="重新生成"
              aria-label="重新生成"
            >
              <RefreshCw />
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'summary' ? (
          <SummaryView store={store} summary={summary} onSettings={onSettings} />
        ) : (
          <TranscriptView store={store} transcript={transcript} onSettings={onSettings} container={rootRef.current} />
        )}
      </div>

      <div className="flex items-center gap-2 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={meta}>
          {meta}
        </span>
        <button type="button" onClick={onSettings} className="flex shrink-0 items-center gap-1 transition hover:text-foreground">
          <Settings2 className="size-3" />
          AI 设置
        </button>
      </div>
    </div>
  );
}
