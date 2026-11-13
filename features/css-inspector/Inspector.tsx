import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, ImageDown, Images, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { BaselineStyles, elementLabel, extractRule, formatRule, type ExtractedRule } from './extract-css';
import { copyElementImage, exportElementImage, imageFileName } from './export-image';

interface Props {
  /** Shadow host of this UI; events coming from it are ours and must not be intercepted. */
  host: HTMLElement;
  onExit: () => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Selection {
  el: Element;
  label: string;
  rule: ExtractedRule;
  text: string;
}

const PANEL_WIDTH = 400;
const MARGIN = 16;
const Z = 2147483647;
const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick'] as const;

const boxOf = (el: Element | null): Box | null => {
  if (!el?.isConnected) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** First child that is actually rendered (skips <script>, <style>, hidden nodes, ...). */
const firstVisibleChild = (children: Iterable<Element>): Element | null =>
  [...children].find((c) => c.getClientRects().length > 0) ?? null;

/** Parent element, stepping out of (open) shadow roots of web components. */
function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function childOf(el: Element, upTrail: Element[]): Element | null {
  const last = upTrail.at(-1);
  if (last && parentOf(last) === el && last.isConnected) return last;
  return firstVisibleChild(el.children) ?? (el.shadowRoot ? firstVisibleChild(el.shadowRoot.children) : null);
}

export default function Inspector({ host, onExit }: Props) {
  const hoverEl = useRef<Element | null>(null);
  const [hoverBox, setHoverBox] = useState<Box | null>(null);
  const [hoverLabel, setHoverLabel] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selBox, setSelBox] = useState<Box | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageTask, setImageTask] = useState<'export' | 'copy' | null>(null);
  const [imageCopied, setImageCopied] = useState(false);
  const [error, setError] = useState('');
  const dragged = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;
  const selectRef = useRef<(el: Element) => void>(() => {});
  /** Children we walked up from, so "down" returns along the same path. */
  const upTrail = useRef<Element[]>([]);

  // Event interception + crosshair cursor while pick mode is active.
  useEffect(() => {
    const baseline = new BaselineStyles(rootRef.current!);
    let cursorSheet: CSSStyleSheet | null = null;
    try {
      cursorSheet = new CSSStyleSheet();
      cursorSheet.replaceSync('*, *::before, *::after { cursor: crosshair !important; }');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, cursorSheet];
    } catch {
      cursorSheet = null;
    }

    const isOwn = (e: Event) => e.composedPath().includes(host);
    // composedPath()[0] reaches into open shadow roots of page web components.
    const targetOf = (e: Event) => {
      const t = e.composedPath()[0];
      return t instanceof Element ? t : null;
    };

    const select = (el: Element) => {
      if (cursorSheet) cursorSheet.disabled = true;
      try {
        const rule = extractRule(el, baseline);
        setSelection({ el, label: elementLabel(el), rule, text: formatRule(rule) });
        setSelBox(boxOf(el));
        setCopied(false);
        setError('');
      } finally {
        if (cursorSheet) cursorSheet.disabled = false;
      }
    };
    selectRef.current = select;

    const onMove = (e: MouseEvent) => {
      if (isOwn(e)) {
        hoverEl.current = null;
        return;
      }
      const t = targetOf(e);
      if (t && t !== hoverEl.current) {
        hoverEl.current = t;
        setHoverLabel(elementLabel(t));
      }
    };
    const onBlocked = (e: Event) => {
      if (isOwn(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const t = targetOf(e);
      if (e.type === 'click' && t) {
        upTrail.current = [];
        select(t);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onExit();
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('keydown', onKey, true);
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, onBlocked, true);
    return () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('keydown', onKey, true);
      for (const type of BLOCKED_EVENTS) window.removeEventListener(type, onBlocked, true);
      if (cursorSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== cursorSheet);
      baseline.destroy();
    };
  }, [host, onExit]);

  // Keep highlight boxes glued to their elements through scrolling, animations and layout changes.
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const h = boxOf(hoverEl.current);
      setHoverBox((prev) => (sameBox(prev, h) ? prev : h));
      const s = boxOf(selectionRef.current?.el ?? null);
      setSelBox((prev) => (sameBox(prev, s) ? prev : s));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Place the panel in a top corner that doesn't cover the selected element, unless the user moved it.
  useEffect(() => {
    if (!selection || dragged.current) return;
    const box = boxOf(selection.el);
    const width = Math.min(PANEL_WIDTH, innerWidth - MARGIN * 2);
    const right = { x: innerWidth - width - MARGIN, y: MARGIN };
    const coversRight = box && box.x + box.w > right.x && box.x < innerWidth - MARGIN;
    const coversLeft = box && box.x < MARGIN + width;
    setPanelPos(coversRight && !coversLeft ? { x: MARGIN, y: MARGIN } : right);
  }, [selection]);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button') || !panelPos) return;
    const header = e.currentTarget;
    header.setPointerCapture(e.pointerId);
    const offset = { x: e.clientX - panelPos.x, y: e.clientY - panelPos.y };
    const move = (ev: PointerEvent) => {
      dragged.current = true;
      setPanelPos({
        x: Math.min(Math.max(ev.clientX - offset.x, 0), innerWidth - 80),
        y: Math.min(Math.max(ev.clientY - offset.y, 0), innerHeight - 40),
      });
    };
    const up = () => {
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', up);
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', up);
  };

  const copy = async () => {
    if (!selection) return;
    await copyText(selection.text, rootRef.current!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const parent = selection ? parentOf(selection.el) : null;
  const child = selection ? childOf(selection.el, upTrail.current) : null;

  const goParent = () => {
    if (!selection || !parent) return;
    upTrail.current.push(selection.el);
    selectRef.current(parent);
  };
  const goChild = () => {
    if (!child) return;
    if (upTrail.current.at(-1) === child) upTrail.current.pop();
    else upTrail.current = [];
    selectRef.current(child);
  };

  const runImageTask = async (kind: 'export' | 'copy', task: Promise<void>) => {
    setImageTask(kind);
    setError('');
    try {
      await task;
      if (kind === 'copy') {
        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 1500);
      }
    } catch (err) {
      setError(`${kind === 'copy' ? '复制图片' : '导出'}失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImageTask(null);
    }
  };

  const exportImage = () => {
    if (!selection || imageTask) return;
    void runImageTask('export', exportElementImage(selection.el, host, imageFileName(selection.label)));
  };

  // Clipboard writes need the click's user activation, so start the write synchronously.
  const copyImage = () => {
    if (!selection || imageTask) return;
    void runImageTask('copy', copyElementImage(selection.el, host));
  };

  const showHover = hoverBox && hoverEl.current !== selection?.el;

  return (
    <div ref={rootRef} className="pointer-events-none fixed inset-0" style={{ zIndex: Z }}>
      {selBox && (
        <div
          className="fixed rounded-[2px] border-2 border-dashed border-orange-500 bg-orange-500/10"
          style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }}
        />
      )}
      {showHover && (
        <>
          <div
            className="fixed rounded-[2px] border-2 border-sky-500 bg-sky-500/15"
            style={{ left: hoverBox.x, top: hoverBox.y, width: hoverBox.w, height: hoverBox.h }}
          />
          <div
            className="fixed max-w-[min(480px,90vw)] truncate rounded-md bg-neutral-900 px-2 py-1 font-mono text-xs text-white shadow"
            style={{
              left: Math.max(4, Math.min(hoverBox.x, innerWidth - 200)),
              top: hoverBox.y > 30 ? hoverBox.y - 28 : Math.min(hoverBox.y + hoverBox.h + 4, innerHeight - 28),
            }}
          >
            <span className="text-sky-300">{hoverLabel}</span>
            <span className="ml-2 text-neutral-400">
              {Math.round(hoverBox.w)} × {Math.round(hoverBox.h)}
            </span>
          </div>
        </>
      )}

      {selection && panelPos ? (
        <div
          className="pointer-events-auto fixed flex max-h-[70vh] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
          style={{ left: panelPos.x, top: panelPos.y, width: Math.min(PANEL_WIDTH, innerWidth - MARGIN * 2) }}
        >
          <div onPointerDown={startDrag} className="flex cursor-move items-center gap-2 border-b px-3 py-2 select-none">
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm font-medium" title={selection.label}>
                {selection.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {selBox ? `${Math.round(selBox.w)} × ${Math.round(selBox.h)} · ` : ''}
                {selection.rule.declarations.length} 条样式
              </div>
            </div>
            <ButtonGroup aria-label="切换选中元素">
              <Button
                size="icon-sm"
                variant="outline"
                onClick={goParent}
                disabled={!parent}
                title={parent ? `选择父元素 ${elementLabel(parent)}` : '已是根元素'}
                aria-label="选择父元素"
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={goChild}
                disabled={!child}
                title={child ? `选择子元素 ${elementLabel(child)}` : '没有可见的子元素'}
                aria-label="选择子元素"
              >
                <ArrowDown />
              </Button>
            </ButtonGroup>
            <Button size="icon-sm" variant="ghost" onClick={onExit} aria-label="退出检查" title="退出（Esc）">
              <X />
            </Button>
          </div>
          <pre className="flex-1 overflow-auto p-3 font-mono text-xs leading-5 select-text">
            <CssCode rule={selection.rule} />
          </pre>
          {error && (
            <div className="border-t px-3 py-1.5 text-xs text-destructive" role="alert">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2 border-t px-3 py-2">
            <ButtonGroup aria-label="图片">
              <Button size="sm" variant="outline" onClick={exportImage} disabled={!!imageTask} title="下载为 PNG 文件">
                {imageTask === 'export' ? <Loader2 className="animate-spin" /> : <ImageDown />}
                {imageTask === 'export' ? '导出中…' : '导出图片'}
              </Button>
              <Button size="sm" variant="outline" onClick={copyImage} disabled={!!imageTask} title="复制 PNG 到剪贴板">
                {imageTask === 'copy' ? <Loader2 className="animate-spin" /> : imageCopied ? <Check /> : <Images />}
                {imageTask === 'copy' ? '复制中…' : imageCopied ? '已复制' : '复制图片'}
              </Button>
            </ButtonGroup>
            <Button size="sm" className="ml-auto" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? '已复制' : '复制 CSS'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/90 px-4 py-2 text-sm text-white shadow-lg">
          点击页面元素查看 CSS · Esc 退出
        </div>
      )}
    </div>
  );
}

const COLOR_RE = /(#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|\btransparent\b)/gi;

function CssValue({ value }: { value: string }) {
  const parts = value.split(COLOR_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Fragment key={i}>
            <span
              className="mr-1 inline-block size-2.5 rounded-[2px] border border-black/20 align-[-1px]"
              style={{ background: part }}
            />
            {part}
          </Fragment>
        ) : (
          part
        ),
      )}
    </>
  );
}

function CssCode({ rule }: { rule: ExtractedRule }) {
  return (
    <code>
      <span className="text-amber-700 dark:text-amber-300">{rule.selector}</span>
      {' {\n'}
      {rule.declarations.map(([prop, value]) => (
        <Fragment key={prop}>
          {'  '}
          <span className="text-sky-700 dark:text-sky-300">{prop}</span>
          {': '}
          <CssValue value={value} />
          {';\n'}
        </Fragment>
      ))}
      {'}'}
    </code>
  );
}

async function copyText(text: string, container: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Clipboard API is unavailable on http pages or when the page lacks focus.
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  container.append(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}
