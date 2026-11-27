import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react';
import { CodeXml, Eraser, Layers } from 'lucide-react';
import { browser } from 'wxt/browser';
import { LAYOUT_XRAY_STYLE_ATTR } from '@/features/layout-xray/toggle';
import { VIDEO_SUMMARY_FEATURE_ID } from '@/features/video-summary/messages';
import { isRunning, type AssistantStore } from '@/features/video-summary/ui/store';
import { SummaryPanel, clampPanelPosition, panelMaxHeight, type PanelPosition, type PanelTab } from '@/features/video-summary/ui/SummaryPanel';
import { OVERLAY_Z } from '@/lib/element-picker';
import { cn } from '@/lib/utils';
import { getFeatureEnabledMap, watchFeatureEnabled } from '@/utils/feature-settings';
import { isExtensionContextLost } from '@/utils/messaging';
import type { OptionsSection } from '@/utils/options-page';
import type { PageVisibility, RequestChannel } from '../bridge';
import { ASSISTANT_FEATURE_ID, ASSISTANT_OPEN_OPTIONS, ASSISTANT_RUN_TOOL, type AssistantToolId, type RunToolResult } from '../messages';
import {
  assistantSettingsItem,
  blockSite,
  getAssistantSettings,
  mascotGreetedItem,
  mascotPositionItem,
  summaryPanelPositionItem,
  videoTipShownItem,
  type AssistantSettings,
  type MascotPosition,
} from '../settings';
import { isSiteBlocked, siteOf } from '../sites';
import { AssistantMenu, MascotContextMenu, type MenuTool } from './AssistantMenu';
import { Mascot, type MascotMood } from './Mascot';
import { useHostDark } from './theme';

const SIZE = 56;
const EDGE = 14;
const GAP = 12;
const PANEL_WIDTH = 420;
const PEEK_AFTER_MS = 5000;
const TIP_MS = 8000;
const DEFAULT_POSITION: MascotPosition = { side: 'right', y: 0.62 };
const UPDATED_MESSAGE = '小T 刚升级完，刷新页面后就能继续使用啦';

const TOOLS: Omit<MenuTool, 'active'>[] = [
  { id: 'element-eraser', label: '元素擦除', hint: '点选隐藏广告、弹窗等元素', icon: Eraser, tile: 'bg-rose-500' },
  { id: 'layout-xray', label: '布局透视', hint: '按层级高亮页面布局边界', icon: Layers, tile: 'bg-emerald-500' },
  { id: 'css-inspector', label: '检查 CSS', hint: '查看元素样式，导出元素图片', icon: CodeXml, tile: 'bg-amber-500' },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Messages the background; resolves undefined if it can't be reached (calls throw synchronously after an update). */
async function sendToBackground<R>(message: { type: string } & Record<string, unknown>): Promise<R | undefined> {
  try {
    return (await browser.runtime.sendMessage(message)) as R;
  } catch {
    return undefined;
  }
}

function pageTitle(): string {
  return document.title.trim() || location.hostname;
}

/**
 * The mascot, its eyes following the pointer while `center` (its middle, in viewport coordinates) is
 * set. Kept apart so pointer moves only re-render this, and only when the eyes visibly move.
 */
function LiveMascot({
  mood,
  look,
  center,
}: {
  mood: MascotMood;
  /** Fixed gaze (e.g. towards an open menu) instead of following the pointer. */
  look: { x: number; y: number } | null;
  center: { x: number; y: number } | null;
}) {
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const cx = center?.x;
  const cy = center?.y;
  const following = !look && cx !== undefined && cy !== undefined;

  useEffect(() => {
    if (!following) return;
    let frame = 0;
    let point: { x: number; y: number } | null = null;
    const step = (v: number) => Math.round(v * 8) / 8;
    const update = () => {
      frame = 0;
      if (!point) return;
      const dx = point.x - cx;
      const dy = point.y - cy;
      const distance = Math.hypot(dx, dy) || 1;
      const strength = Math.min(1, distance / 160);
      const next = { x: step((dx / distance) * strength), y: step((dy / distance) * strength) };
      setGaze((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
    };
    const onMove = (e: PointerEvent) => {
      point = { x: e.clientX, y: e.clientY };
      frame ||= requestAnimationFrame(update);
    };
    addEventListener('pointermove', onMove, { passive: true });
    return () => {
      removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [following, cx, cy]);

  return <Mascot mood={mood} gaze={look ?? (following ? gaze : { x: 0, y: 0 })} className="size-full" />;
}

function Bubble({ text, style, side, onClick }: { text: string; style: CSSProperties; side: 'left' | 'right'; onClick?: () => void }) {
  return (
    <div
      role="status"
      className="pointer-events-auto fixed max-w-[250px] rounded-2xl border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-200"
      style={style}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="text-left hover:text-indigo-600 dark:hover:text-indigo-300">
          {text}
        </button>
      ) : (
        text
      )}
      <span
        className={cn(
          'absolute top-1/2 size-2.5 -translate-y-1/2 rotate-45 border bg-popover',
          side === 'right' ? '-right-[6px] border-b-0 border-l-0' : '-left-[6px] border-t-0 border-r-0',
        )}
      />
    </div>
  );
}

interface Props {
  /** Video summary state for this page (its ref is null away from video pages). */
  store: AssistantStore;
  /** Shadow host; pointer events inside it are ours. */
  host: HTMLElement;
  requests: RequestChannel<PanelTab>;
  visibility: PageVisibility;
}

export function Assistant({ store, host, requests, visibility }: Props) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const hiddenOnPage = useSyncExternalStore(visibility.subscribe, visibility.isHidden);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean> | null>(null);
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const [position, setPosition] = useState<MascotPosition>(DEFAULT_POSITION);
  const [viewport, setViewport] = useState({ w: innerWidth, h: innerHeight });
  const [menu, setMenu] = useState<'main' | 'context' | null>(null);
  const [panel, setPanel] = useState<PanelTab | null>(null);
  /** Where the user dragged the panel; null keeps it beside 小T. */
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const [hover, setHover] = useState(false);
  // Tucked into the screen edge; slides out on hover, on video pages and when it has something to say.
  const [peek, setPeek] = useState(true);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [seenKey, setSeenKey] = useState<string | null>(null);
  const [xrayActive, setXrayActive] = useState(false);
  /** Keeps 小T on screen for its goodbye after being hidden. */
  const [farewell, setFarewell] = useState(false);
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { summary } = state;
  const site = siteOf(location.hostname);
  const loaded = !!enabledMap && !!settings;
  const video = loaded && enabledMap[VIDEO_SUMMARY_FEATURE_ID] !== false ? state.ref : null;
  const blocked = !!settings && isSiteBlocked(location.hostname, settings.blockedSites);
  const showMascot = loaded && enabledMap[ASSISTANT_FEATURE_ID] !== false && ((!blocked && !hiddenOnPage) || farewell);
  const panelOpen = !!panel && !!video;
  const running = !!video && isRunning(summary.phase);

  useEffect(() => {
    void getFeatureEnabledMap().then(setEnabledMap);
    void getAssistantSettings().then(setSettings);
    void mascotPositionItem.getValue().then((saved) => saved && setPosition(saved));
    void summaryPanelPositionItem.getValue().then(setPanelPosition);
    const unwatchFeatures = watchFeatureEnabled(() => void getFeatureEnabledMap().then(setEnabledMap));
    const unwatchSettings = assistantSettingsItem.watch(() => void getAssistantSettings().then(setSettings));
    // Moving 小T in one tab moves it everywhere.
    const unwatchPosition = mascotPositionItem.watch((next) => next && setPosition(next));
    const unwatchPanelPosition = summaryPanelPositionItem.watch(setPanelPosition);
    const onResize = () => setViewport({ w: innerWidth, h: innerHeight });
    addEventListener('resize', onResize);
    return () => {
      unwatchFeatures();
      unwatchSettings();
      unwatchPosition();
      unwatchPanelPosition();
      removeEventListener('resize', onResize);
      clearTimeout(flashTimer.current);
    };
  }, []);

  // Leaving the video page (or turning video summaries off) closes the panel.
  useEffect(() => {
    if (!video) setPanel(null);
  }, [video]);

  useEffect(() => {
    if (!showMascot) setMenu(null);
  }, [showMascot]);

  // Requests from the popup's "总结当前视频" button.
  useEffect(
    () =>
      requests.subscribe((tab) => {
        if (!store.getState().ref) return;
        setMenu(null);
        setPanel(tab);
        if (tab === 'summary') void store.summarize();
      }),
    [requests, store],
  );

  // One-time introductions: the first time 小T appears, and on the first video page.
  const onVideoPage = !!video;
  useEffect(() => {
    if (!showMascot) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void Promise.all([mascotGreetedItem.getValue(), videoTipShownItem.getValue()]).then(([greeted, videoTipShown]) => {
      if (cancelled) return;
      let text: string | null = null;
      if (onVideoPage && !videoTipShown) {
        text = greeted ? '这是视频页，点我就能一键 AI 总结哦 ✨' : 'Hi～我是小T，点我就能一键 AI 总结这个视频哦 ✨';
        void videoTipShownItem.setValue(true);
      } else if (!greeted) {
        text = 'Hi～我是小T，点我打开工具箱；不想看到我时，右键我就能藏起来';
      }
      if (!text) return;
      void mascotGreetedItem.setValue(true);
      setTip(text);
      timer = setTimeout(() => setTip(null), TIP_MS);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setTip(null);
    };
  }, [showMascot, onVideoPage]);

  // A finished (or failed) summary the user hasn't looked at yet makes 小T call for attention.
  const attentionKey = !video
    ? null
    : summary.phase === 'done'
      ? `done:${summary.createdAt}`
      : summary.phase === 'error'
        ? `error:${summary.error?.message}`
        : null;
  useEffect(() => {
    if (panel === 'summary' && attentionKey) setSeenKey(attentionKey);
  }, [panel, attentionKey]);
  const unseen = !!attentionKey && attentionKey !== seenKey;

  const showFlash = (text: string, ms = 2600, then?: () => void) => {
    clearTimeout(flashTimer.current);
    setFlash(text);
    flashTimer.current = setTimeout(() => {
      setFlash(null);
      then?.();
    }, ms);
  };

  const openSummary = () => {
    setMenu(null);
    setTip(null);
    setPanel('summary');
    void store.summarize();
  };
  const openTranscript = () => {
    setMenu(null);
    setPanel('transcript');
  };
  const openSettings = async (section?: OptionsSection) => {
    setMenu(null);
    if (!(await sendToBackground<true>({ type: ASSISTANT_OPEN_OPTIONS, section }))) showFlash('打不开设置页，请刷新页面后重试');
  };
  const runTool = async (tool: AssistantToolId) => {
    setMenu(null);
    const result = await sendToBackground<RunToolResult>({ type: ASSISTANT_RUN_TOOL, tool });
    if (!result?.ok) showFlash(result?.error ?? '工具启动失败了');
  };
  /** Says goodbye, then stays hidden. */
  const dismiss = (text: string, hide: () => unknown) => {
    setMenu(null);
    setTip(null);
    setFarewell(true);
    void hide();
    showFlash(text, 2400, () => setFarewell(false));
  };
  const hideOnPage = () => dismiss('好的，小T 先躲起来～刷新页面后我就回来', () => visibility.setHidden(true));
  const blockThisSite = () => dismiss(`好的，以后在 ${site} 就不打扰你啦`, () => blockSite(site));

  let bubble: { text: string; onClick?: () => void } | null = null;
  if (flash) bubble = { text: flash };
  else if (!panelOpen && !menu) {
    if (running) bubble = { text: summary.phase === 'writing' ? '正在写总结，马上就好…' : '小T 正在看视频…', onClick: openSummary };
    else if (unseen) bubble = { text: summary.phase === 'done' ? '总结好啦，点我查看 ✨' : '总结没成功，点我看看', onClick: openSummary };
    else if (tip) bubble = { text: tip, onClick: () => (setTip(null), setMenu('main')) };
  }
  const dark = useHostDark(panelOpen || (showMascot && (!!menu || !!bubble)));

  const videoKey = video?.key ?? null;
  const idle = showMascot && !menu && !panelOpen && !bubble && !hover && !drag && !running && !unseen;
  useEffect(() => {
    // Keep it tucked while settings load, so it doesn't pop out on every page.
    if (!showMascot) return;
    if (!idle) {
      setPeek(false);
      return;
    }
    const timer = setTimeout(() => setPeek(true), PEEK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [showMascot, idle, videoKey]);
  // Slide out on each video page, so its summary is one click away.
  useEffect(() => {
    if (videoKey) setPeek(false);
  }, [videoKey]);

  useEffect(() => {
    if (!menu && !panelOpen) return;
    const inside = (e: Event) => e.composedPath().includes(host);
    const onPointerDown = (e: PointerEvent) => {
      if (menu && !inside(e)) setMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menu) setMenu(null);
      // Escape on the page itself belongs to the site (e.g. leaving fullscreen).
      else if (panelOpen && inside(e)) setPanel(null);
    };
    addEventListener('pointerdown', onPointerDown, true);
    addEventListener('keydown', onKeyDown, true);
    return () => {
      removeEventListener('pointerdown', onPointerDown, true);
      removeEventListener('keydown', onKeyDown, true);
    };
  }, [menu, panelOpen, host]);

  if (!showMascot && !panelOpen) return null;

  const side = position.side;
  const atSide = (offset: number): CSSProperties => (side === 'right' ? { right: offset } : { left: offset });
  const mascotTop = EDGE + position.y * Math.max(0, viewport.h - SIZE - EDGE * 2);
  const besideMascot = EDGE + SIZE + GAP;
  const lowerHalf = mascotTop + SIZE / 2 > viewport.h / 2;
  const menuStyle: CSSProperties = {
    ...atSide(besideMascot),
    ...(lowerHalf ? { bottom: Math.max(EDGE, viewport.h - mascotTop - SIZE) } : { top: mascotTop }),
  };
  const panelOffset = showMascot ? besideMascot : EDGE;
  const panelTop = clamp(Math.round(viewport.h * 0.09), EDGE, 72);
  let panelStyle: CSSProperties = {
    ...atSide(panelOffset),
    top: panelTop,
    width: Math.max(280, Math.min(PANEL_WIDTH, viewport.w - panelOffset - EDGE)),
    // Short states (progress, errors) shrink to fit; long content scrolls inside.
    maxHeight: Math.max(280, Math.min(720, viewport.h - panelTop - EDGE)),
  };
  if (panelPosition) {
    // Wherever it was dropped, kept inside the window (which may be smaller than when it was moved).
    const width = Math.max(280, Math.min(PANEL_WIDTH, viewport.w - EDGE * 2));
    const { x, y } = clampPanelPosition(panelPosition, width);
    panelStyle = { left: x, top: y, width, maxHeight: panelMaxHeight(y) };
  }
  const movePanel = (next: PanelPosition | null) => {
    setPanelPosition(next);
    void summaryPanelPositionItem.setValue(next);
  };
  const bubbleStyle: CSSProperties = { ...atSide(besideMascot - 4), top: mascotTop + SIZE / 2, transform: 'translateY(-50%)' };

  const mood: MascotMood = running
    ? 'thinking'
    : unseen
      ? summary.phase === 'error'
        ? 'error'
        : 'done'
      : hover || menu || tip
        ? 'happy'
        : 'idle';
  const look = menu || panelOpen ? { x: side === 'right' ? -0.9 : 0.9, y: 0 } : null;
  const title = video
    ? state.transcript.video?.meta.title || document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*[-_|]\s*(YouTube|哔哩哔哩.*|bilibili.*)$/i, '')
    : pageTitle();
  const tools = TOOLS.filter((tool) => enabledMap?.[tool.id] !== false).map((tool) => ({
    ...tool,
    active: tool.id === 'layout-xray' && xrayActive,
  }));

  const onMascotClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setTip(null);
    // This page still runs the script from before an extension update, which can't reach the extension anymore.
    if (isExtensionContextLost()) return showFlash(UPDATED_MESSAGE);
    if (!menu && !panelOpen && (running || unseen)) return openSummary();
    if (menu !== 'main') setXrayActive(!!document.querySelector(`style[${LAYOUT_XRAY_STYLE_ATTR}]`));
    setMenu(menu === 'main' ? null : 'main');
  };
  const onMascotContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setTip(null);
    if (isExtensionContextLost()) return showFlash(UPDATED_MESSAGE);
    setMenu(menu === 'context' ? null : 'context');
  };

  return (
    <div className={cn('tva-root pointer-events-none fixed inset-0 font-sans', dark && 'dark')} style={{ zIndex: OVERLAY_Z - 1 }}>
      {panelOpen && (
        <SummaryPanel
          state={state}
          store={store}
          tab={panel}
          mood={mood}
          title={title}
          style={panelStyle}
          onTab={setPanel}
          onClose={() => setPanel(null)}
          onSettings={() => void openSettings('ai')}
          onMove={movePanel}
          onResetPosition={() => movePanel(null)}
        />
      )}

      {showMascot && menu === 'main' && (
        <AssistantMenu
          style={menuStyle}
          title={title}
          video={video ? { phase: summary.phase } : null}
          tools={tools}
          onSummary={openSummary}
          onTranscript={openTranscript}
          onTool={(tool) => void runTool(tool)}
          onSettings={() => void openSettings()}
          onHide={hideOnPage}
        />
      )}

      {showMascot && menu === 'context' && (
        <MascotContextMenu
          style={menuStyle}
          site={site || null}
          onHidePage={hideOnPage}
          onBlockSite={blockThisSite}
          onManage={() => void openSettings('assistant')}
        />
      )}

      {showMascot && bubble && !drag && <Bubble text={bubble.text} style={bubbleStyle} side={side} onClick={bubble.onClick} />}

      {showMascot && (
        <button
          type="button"
          aria-label="小T 页面助手"
          aria-haspopup="menu"
          aria-expanded={menu === 'main'}
          title={peek ? '小T 页面助手（右键可隐藏）' : undefined}
          className={cn(
            'pointer-events-auto fixed touch-none rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-indigo-400',
            drag ? 'cursor-grabbing' : 'cursor-pointer transition-[transform,opacity] duration-300',
          )}
          style={{
            ...(drag ? { left: drag.x, top: drag.y } : { ...atSide(EDGE), top: mascotTop }),
            width: SIZE,
            height: SIZE,
            transform: peek ? `translateX(${side === 'right' ? 58 : -58}%)` : undefined,
            opacity: peek ? 0.8 : 1,
            filter: 'drop-shadow(0 6px 12px rgb(79 70 229 / 0.35))',
          }}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            pointer.current = { x: e.clientX, y: e.clientY, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const p = pointer.current;
            if (!p || (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5)) return;
            p.moved = true;
            setMenu(null);
            setDrag({ x: clamp(e.clientX - SIZE / 2, 0, innerWidth - SIZE), y: clamp(e.clientY - SIZE / 2, 0, innerHeight - SIZE) });
          }}
          onPointerUp={(e) => {
            const p = pointer.current;
            pointer.current = null;
            if (!p?.moved) return;
            suppressClick.current = true;
            const next: MascotPosition = {
              side: e.clientX < innerWidth / 2 ? 'left' : 'right',
              y: clamp((e.clientY - SIZE / 2 - EDGE) / Math.max(1, innerHeight - SIZE - EDGE * 2), 0, 1),
            };
            setPosition(next);
            setDrag(null);
            void mascotPositionItem.setValue(next);
          }}
          onPointerCancel={() => {
            pointer.current = null;
            setDrag(null);
          }}
          onClick={onMascotClick}
          onContextMenu={onMascotContextMenu}
        >
          <div className={cn('size-full', unseen ? 'tva-hop' : !drag && !peek && 'tva-float', peek && 'tva-still')}>
            <LiveMascot
              mood={mood}
              look={look}
              center={peek || drag ? null : { x: side === 'right' ? viewport.w - EDGE - SIZE / 2 : EDGE + SIZE / 2, y: mascotTop + SIZE / 2 }}
            />
          </div>
          {unseen && !peek && <span className="absolute top-0.5 right-0.5 size-3 rounded-full border-2 border-white bg-rose-500" />}
        </button>
      )}
    </div>
  );
}
