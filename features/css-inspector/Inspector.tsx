import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, ImageDown, Images, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { elementLabel, parentOf } from '@/lib/dom';
import { boxOf, HoverHighlight, OVERLAY_Z, sameBox, useElementPicker, type Box } from '@/lib/element-picker';
import { BaselineStyles, extractRule, formatRule, type ExtractedRule } from './extract-css';
import { copyElementImage, elementImageFileName, exportElementImage } from './render-element';

interface Props {
  /** Shadow host of this UI; events coming from it are ours and must not be intercepted. */
  host: HTMLElement;
  onExit: () => void;
}

interface Selection {
  el: Element;
  label: string;
  rule: ExtractedRule;
  text: string;
}

const PANEL_WIDTH = 400;
const MARGIN = 16;

/** First child that is actually rendered (skips <script>, <style>, hidden nodes, ...). */
const firstVisibleChild = (children: Iterable<Element>): Element | null =>
  [...children].find((c) => c.getClientRects().length > 0) ?? null;

function childOf(el: Element, upTrail: Element[]): Element | null {
  const last = upTrail.at(-1);
  if (last && parentOf(last) === el && last.isConnected) return last;
  return firstVisibleChild(el.children) ?? (el.shadowRoot ? firstVisibleChild(el.shadowRoot.children) : null);
}

export default function Inspector({ host, onExit }: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selBox, setSelBox] = useState<Box | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageTask, setImageTask] = useState<'export' | 'copy' | null>(null);
  const [imageCopied, setImageCopied] = useState(false);
  const [error, setError] = useState('');
  const dragged = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const baselineRef = useRef<BaselineStyles | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;
  /** Children we walked up from, so "down" returns along the same path. */
  const upTrail = useRef<Element[]>([]);

  useEffect(() => {
    const baseline = new BaselineStyles(rootRef.current!);
    baselineRef.current = baseline;
    return () => {
      baseline.destroy();
      baselineRef.current = null;
    };
  }, []);

  const select = useCallback((el: Element) => {
    const baseline = baselineRef.current;
    if (!baseline) return;
    const rule = extractRule(el, baseline);
    setSelection({ el, label: elementLabel(el), rule, text: formatRule(rule) });
    setSelBox(boxOf(el));
    setCopied(false);
    setError('');
  }, []);

  const { hoverElRef, hoverBox, hoverLabel, runWithoutCursor } = useElementPicker({
    host,
    onPick: (el) => {
      upTrail.current = [];
      select(el);
    },
    onExit,
  });

  // Keep the selected element's highlight glued to it through scrolling, animations and layout changes.
  useEffect(() => {
    let frame = 0;
    const loop = () => {
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
    runWithoutCursor(() => select(parent));
  };
  const goChild = () => {
    if (!child) return;
    if (upTrail.current.at(-1) === child) upTrail.current.pop();
    else upTrail.current = [];
    runWithoutCursor(() => select(child));
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
    void runImageTask('export', exportElementImage(selection.el, host, elementImageFileName(selection.label)));
  };

  // Clipboard writes need the click's user activation, so start the write synchronously.
  const copyImage = () => {
    if (!selection || imageTask) return;
    void runImageTask('copy', copyElementImage(selection.el, host));
  };

  const showHover = hoverBox && hoverElRef.current !== selection?.el;

  return (
    <div ref={rootRef} className="pointer-events-none fixed inset-0" style={{ zIndex: OVERLAY_Z }}>
      {selBox && (
        <div
          className="fixed rounded-xs border-2 border-dashed border-orange-500 bg-orange-500/10"
          style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }}
        />
      )}
      {showHover && <HoverHighlight box={hoverBox} label={hoverLabel} tone="sky" />}

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
              className="mr-1 inline-block size-2.5 rounded-xs border border-black/20 align-[-1px]"
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
