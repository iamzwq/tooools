import type { CSSProperties } from 'react';
import { Ban, ChevronRight, EyeOff, Loader2, ScrollText, Settings2, Sparkles, type LucideIcon } from 'lucide-react';
import { isRunning, type SummaryPhase } from '@/features/video-summary/ui/store';
import { cn } from '@/lib/utils';
import type { AssistantToolId } from '../messages';

export interface MenuTool {
  id: AssistantToolId;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile, matching the popup. */
  tile: string;
  active?: boolean;
}

interface Props {
  style: CSSProperties;
  title: string;
  /** Set on video pages: the summary's current phase. */
  video: { phase: SummaryPhase } | null;
  tools: MenuTool[];
  onSummary: () => void;
  onTranscript: () => void;
  onTool: (id: AssistantToolId) => void;
  onSettings: () => void;
  onHide: () => void;
}

const SUMMARY_HINTS: Record<SummaryPhase, string> = {
  idle: '提炼要点，时间戳一点就跳',
  transcript: '正在读取字幕…',
  chunks: '正在分段整理…',
  thinking: '正在阅读字幕…',
  writing: '正在生成总结…',
  done: '已生成，点击查看',
  error: '上次没成功，点击查看',
};

const POPOVER = 'pointer-events-auto fixed overflow-hidden border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150';

function VideoSection({ phase, onSummary, onTranscript }: { phase: SummaryPhase; onSummary: () => void; onTranscript: () => void }) {
  return (
    <div className="flex flex-col gap-1 px-1.5 pb-1.5">
      <button
        type="button"
        role="menuitem"
        onClick={onSummary}
        className="group flex items-center gap-3 rounded-xl bg-linear-to-r from-violet-500 to-indigo-500 px-3 py-2.5 text-left text-white shadow-md shadow-indigo-500/25 transition hover:brightness-110 active:brightness-95"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/20">
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">AI 总结视频</span>
          <span className="block truncate text-[11px] text-white/80">{SUMMARY_HINTS[phase]}</span>
        </span>
        {isRunning(phase) ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          <ChevronRight className="size-4 shrink-0 opacity-70 transition group-hover:translate-x-0.5" />
        )}
      </button>
      <button type="button" role="menuitem" onClick={onTranscript} className="flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-muted">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-300">
          <ScrollText className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">字幕文稿</span>
          <span className="block truncate text-[11px] text-muted-foreground">浏览、搜索、复制完整字幕</span>
        </span>
      </button>
    </div>
  );
}

function toolLabel(tool: MenuTool) {
  return tool.active ? `${tool.label}中` : tool.label;
}

/** On video pages the tools shrink to a row under the video actions; elsewhere they are the menu. */
function ToolSection({ tools, compact, onTool }: { tools: MenuTool[]; compact: boolean; onTool: (id: AssistantToolId) => void }) {
  if (compact) {
    return (
      <div className="border-t px-1.5 py-1.5">
        <div className="px-2 pt-0.5 pb-1 text-[11px] font-medium text-muted-foreground">页面工具</div>
        <div className="grid grid-cols-3 gap-1">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              role="menuitem"
              onClick={() => onTool(tool.id)}
              title={tool.hint}
              aria-pressed={tool.id === 'layout-xray' ? !!tool.active : undefined}
              className={cn('flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] transition hover:bg-muted', tool.active && 'bg-muted font-medium')}
            >
              <span className={cn('grid size-7 place-items-center rounded-lg text-white', tool.tile)}>
                <tool.icon className="size-3.5" />
              </span>
              {toolLabel(tool)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 px-1.5 pb-1.5">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          role="menuitem"
          onClick={() => onTool(tool.id)}
          aria-pressed={tool.id === 'layout-xray' ? !!tool.active : undefined}
          className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-muted', tool.active && 'bg-muted')}
        >
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg text-white', tool.tile)}>
            <tool.icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">{toolLabel(tool)}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{tool.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function AssistantMenu({ style, title, video, tools, onSummary, onTranscript, onTool, onSettings, onHide }: Props) {
  return (
    <div role="menu" aria-label="小T 页面助手" className={cn(POPOVER, 'w-66 rounded-2xl')} style={style}>
      <div className="px-3.5 pt-3 pb-2">
        <div className="text-[13px] font-semibold">
          小T <span className="font-normal text-muted-foreground">· {video ? '视频助手' : '页面助手'}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground" title={title}>
          {title}
        </div>
      </div>

      {video && <VideoSection phase={video.phase} onSummary={onSummary} onTranscript={onTranscript} />}
      {tools.length > 0 && <ToolSection tools={tools} compact={!!video} onTool={onTool} />}
      {!video && !tools.length && <div className="px-3.5 pb-3 text-xs text-muted-foreground">页面工具都已关闭，可以在扩展弹窗里开启。</div>}

      <div className="flex items-center border-t px-1.5 py-1">
        <button
          type="button"
          onClick={onSettings}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="size-3.5" />
          设置
        </button>
        <button
          type="button"
          onClick={onHide}
          title="刷新页面后恢复；右键小T 还可以设置在此网站不再显示"
          className="ml-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <EyeOff className="size-3.5" />
          暂时隐藏
        </button>
      </div>
    </div>
  );
}

function ContextItem({ icon: Icon, label, hint, onClick }: { icon: LucideIcon; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-muted">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]" title={label}>
          {label}
        </span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}

/** Right-click menu on 小T. */
export function MascotContextMenu({
  style,
  site,
  onHidePage,
  onBlockSite,
  onManage,
}: {
  style: CSSProperties;
  /** The page's site, or null where sites can't be blocked (e.g. local files). */
  site: string | null;
  onHidePage: () => void;
  onBlockSite: () => void;
  onManage: () => void;
}) {
  return (
    <div role="menu" aria-label="小T 选项" className={cn(POPOVER, 'w-59 rounded-xl p-1')} style={style}>
      <ContextItem icon={EyeOff} label="在当前页面隐藏" hint="刷新页面后恢复" onClick={onHidePage} />
      {site && <ContextItem icon={Ban} label={`在 ${site} 不再显示`} hint="可以在设置里恢复" onClick={onBlockSite} />}
      <div className="mx-1 my-1 h-px bg-border" />
      <ContextItem icon={Settings2} label="管理不显示的网站" onClick={onManage} />
    </div>
  );
}
