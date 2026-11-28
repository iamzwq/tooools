import { useCallback, useEffect, useRef, useState } from 'react';
import { elementLabel } from './dom';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const OVERLAY_Z = 2147483647;
const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick'] as const;

export const boxOf = (el: Element | null): Box | null => {
  if (!el?.isConnected) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

export const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** Events from Tooools' own page UIs (e.g. 小T), whose shadow hosts are named `tooools-*`. */
const fromToooolsUi = (e: Event) => e.composedPath().some((node) => node instanceof Element && node.localName.startsWith('tooools-'));

export interface UseElementPickerOptions {
  /** Shadow host of the overlay UI; events coming from it are ignored. */
  host: HTMLElement;
  /** Optional filter for pickable elements (e.g. skip html/body). */
  accept?: (el: Element) => boolean;
  onPick: (el: Element) => void;
  onExit: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}

/**
 * Interactive page-element picker: sets a crosshair cursor, intercepts page pointer events,
 * pierces open shadow roots via `composedPath()`, and tracks the hovered element's bounding box.
 */
export function useElementPicker({ host, accept, onPick, onExit, onKeyDown }: UseElementPickerOptions) {
  const hoverElRef = useRef<Element | null>(null);
  const [hoverBox, setHoverBox] = useState<Box | null>(null);
  const [hoverLabel, setHoverLabel] = useState('');
  const cursorSheetRef = useRef<CSSStyleSheet | null>(null);

  const callbacksRef = useRef({ accept, onPick, onExit, onKeyDown });
  callbacksRef.current = { accept, onPick, onExit, onKeyDown };

  const runWithoutCursor = useCallback(<T,>(fn: () => T): T => {
    const sheet = cursorSheetRef.current;
    if (sheet) sheet.disabled = true;
    try {
      return fn();
    } finally {
      if (sheet) sheet.disabled = false;
    }
  }, []);

  const clearHover = useCallback(() => {
    hoverElRef.current = null;
    setHoverBox(null);
    setHoverLabel('');
  }, []);

  useEffect(() => {
    let cursorSheet: CSSStyleSheet | null = null;
    try {
      cursorSheet = new CSSStyleSheet();
      cursorSheet.replaceSync('*, *::before, *::after { cursor: crosshair !important; }');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, cursorSheet];
    } catch {
      cursorSheet = null;
    }
    cursorSheetRef.current = cursorSheet;

    const isOwn = (e: Event) => e.composedPath().includes(host);
    // composedPath()[0] reaches into open shadow roots of page web components.
    const targetOf = (e: Event) => {
      if (fromToooolsUi(e)) return null;
      const t = e.composedPath()[0];
      if (!(t instanceof Element)) return null;
      if (callbacksRef.current.accept && !callbacksRef.current.accept(t)) return null;
      return t;
    };

    const onMove = (e: MouseEvent) => {
      if (isOwn(e)) {
        hoverElRef.current = null;
        return;
      }
      const t = targetOf(e);
      if (t !== hoverElRef.current) {
        hoverElRef.current = t;
        setHoverLabel(t ? elementLabel(t) : '');
      }
    };

    const onBlocked = (e: Event) => {
      if (isOwn(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const t = targetOf(e);
      if (e.type === 'click' && t) {
        runWithoutCursor(() => callbacksRef.current.onPick(t));
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        callbacksRef.current.onExit();
        return;
      }
      callbacksRef.current.onKeyDown?.(e);
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('keydown', onKey, true);
    for (const type of BLOCKED_EVENTS) window.addEventListener(type, onBlocked, true);
    return () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('keydown', onKey, true);
      for (const type of BLOCKED_EVENTS) window.removeEventListener(type, onBlocked, true);
      if (cursorSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== cursorSheet);
      cursorSheetRef.current = null;
    };
  }, [host, runWithoutCursor]);

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const h = boxOf(hoverElRef.current);
      setHoverBox((prev) => (sameBox(prev, h) ? prev : h));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return { hoverElRef, hoverBox, hoverLabel, clearHover, runWithoutCursor };
}

const TONE_STYLES = {
  sky: {
    box: 'border-sky-500 bg-sky-500/15',
    label: 'text-sky-300',
  },
  rose: {
    box: 'border-dashed border-rose-500 bg-rose-500/15',
    label: 'text-rose-300',
  },
} as const;

export function HoverHighlight({
  box,
  label,
  tone = 'sky',
}: {
  box: Box;
  label: string;
  tone?: keyof typeof TONE_STYLES;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <>
      <div
        className={`fixed rounded-xs border-2 ${styles.box}`}
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      />
      <div
        className="fixed max-w-[min(480px,90vw)] truncate rounded-md bg-neutral-900 px-2 py-1 font-mono text-xs text-white shadow-sm"
        style={{
          left: Math.max(4, Math.min(box.x, innerWidth - 200)),
          top: box.y > 30 ? box.y - 28 : Math.min(box.y + box.h + 4, innerHeight - 28),
        }}
      >
        <span className={styles.label}>{label}</span>
        <span className="ml-2 text-neutral-400">
          {Math.round(box.w)} × {Math.round(box.h)}
        </span>
      </div>
    </>
  );
}
