import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { parentOf } from '@/lib/dom';
import { elementsAt, resolveImages } from '@/lib/image-target/resolve';
import { isExtensionContextLost } from '@/utils/messaging';
import { EXPORT_IMAGE_COPY, type CopyImageMessage, type CopyImageResponse } from './messages';

/** Element pickers ignore page UIs whose shadow host is named `tooools-*`. */
const HOST_NAME = 'tooools-image-copy';
/** Smaller images (icons, avatars, emoji) get no button. */
export const HOVER_COPY_MIN_SIZE = 100;
const INSET = 8;
/** How many elements under the pointer to look through for the picture. */
const MAX_STACK = 12;
/**
 * Something on top of a picture belongs to it (a link, play icon or gradient over a thumbnail) when the
 * smallest box holding both is at most this many times the picture's area; a dialog or panel is not.
 */
const MAX_OVERLAY_AREA_RATIO = 4;
const HIDE_DELAY = 150;
const DONE_MS = 1500;
const ERROR_MS = 4000;

type State = 'idle' | 'busy' | 'done' | 'error';

const LABELS: Record<State, string> = { idle: '复制', busy: '复制中', done: '已复制', error: '复制失败' };

// Lucide icons (copy, loader, check, circle-alert) as path data: no innerHTML, which Trusted Types pages reject.
const ICONS: Record<State, string[]> = {
  idle: [
    'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
    'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2',
  ],
  busy: ['M21 12a9 9 0 1 1-6.219-8.56'],
  done: ['M20 6 9 17l-5-5'],
  error: ['M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z', 'M12 8v4', 'M12 16h.01'],
};

const HOST_STYLE = [
  'all: initial',
  'position: fixed',
  'top: 0',
  'left: 0',
  'width: 0',
  'height: 0',
  'overflow: visible',
  'z-index: 2147483647',
]
  .map((rule) => `${rule} !important`)
  .join(';');

const CSS = `
button {
  all: initial;
  position: fixed;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px 0 8px;
  border-radius: 8px;
  background: rgb(17 17 24 / 0.72);
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.25), inset 0 0 0 1px rgb(255 255 255 / 0.14);
  backdrop-filter: blur(6px);
  color: #fff;
  font: 500 12px/1 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  opacity: 0;
  transform: translateY(-3px);
  pointer-events: none;
  transition: opacity 0.15s, transform 0.15s, background-color 0.15s;
}
button.show {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
button:hover {
  background: rgb(17 17 24 / 0.9);
}
button:focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 2px;
}
button[data-state="busy"] {
  cursor: progress;
}
button[data-state="done"] {
  background: #16a34a;
}
button[data-state="error"] {
  background: #dc2626;
}
svg {
  width: 14px;
  height: 14px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
button[data-state="busy"] svg {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.tip {
  position: fixed;
  box-sizing: border-box;
  max-width: 260px;
  padding: 6px 9px;
  border-radius: 6px;
  background: rgb(17 17 24 / 0.92);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  color: #fff;
  font: 12px/1.5 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
.tip.show {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  button,
  .tip {
    transition: none;
  }
  button[data-state="busy"] svg {
    animation: none;
  }
}
@media print {
  button,
  .tip {
    display: none !important;
  }
}
`;

function inToooolsUi(el: Element): boolean {
  for (let node: Element | null = el; node; node = parentOf(node)) {
    if (node.localName.startsWith('tooools-')) return true;
  }
  return false;
}

function containsDeep(ancestor: Element, node: Element): boolean {
  for (let n: Element | null = node; n; n = parentOf(n)) {
    if (n === ancestor) return true;
  }
  return false;
}

/** An <img>, or a text-free box whose background is a picture (not decoration behind text). */
function isPicture(el: Element): boolean {
  if (el instanceof HTMLImageElement) return el.naturalWidth > 0 && !!(el.currentSrc || el.src);
  if (!(el instanceof HTMLElement) || el === document.body) return false;
  return getComputedStyle(el).backgroundImage.includes('url(') && !el.textContent?.trim();
}

function area(rect: DOMRect): number {
  return rect.width * rect.height;
}

/** Whether the topmost element is the picture or part of it, rather than a dialog or panel covering it. */
function belongsTo(top: Element, picture: Element, rect: DOMRect): boolean {
  if (containsDeep(picture, top) || containsDeep(top, picture)) return true;
  for (let box = parentOf(picture); box; box = parentOf(box)) {
    if (!containsDeep(box, top)) continue;
    // Only the page itself holds both: something from elsewhere on the page (a dialog, a panel) covers it.
    if (box === document.body || box === document.documentElement) return false;
    return area(box.getBoundingClientRect()) <= area(rect) * MAX_OVERLAY_AREA_RATIO;
  }
  return false;
}

/** The picture under the point that gets a button, if any. */
function pictureAt(x: number, y: number): Element | null {
  const stack = elementsAt(document, x, y);
  const top = stack[0];
  if (!top || inToooolsUi(top)) return null;
  for (const el of stack.slice(0, MAX_STACK)) {
    if (el === document.body || el === document.documentElement) return null;
    if (!isPicture(el)) continue;
    const rect = el.getBoundingClientRect();
    // Small pictures over a big one (e.g. a play icon on a thumbnail): keep looking below.
    if (rect.width < HOVER_COPY_MIN_SIZE || rect.height < HOVER_COPY_MIN_SIZE) continue;
    return belongsTo(top, el, rect) ? el : null;
  }
  return null;
}

function contains(el: Element, x: number, y: number): boolean {
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/**
 * A 「复制」 button in the top-right corner of the picture under the mouse. Clicking it copies the image
 * the same way as the 「复制图片」 menu item (PNG only, so editors upload the image instead of linking it).
 */
export function createHoverCopyButton(ctx: ContentScriptContext) {
  let active = false;
  let ui: { host: HTMLElement; button: HTMLButtonElement; icon: SVGSVGElement; label: HTMLSpanElement; tip: HTMLDivElement } | null = null;
  /** The picture the button is on, and the last pointer position over it (not over the button). */
  let picture: Element | null = null;
  let point = { x: 0, y: 0 };
  let pointer: { x: number; y: number; target: EventTarget | null } | null = null;
  let lastTarget: EventTarget | null = null;
  let frame = 0;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  /** Copying or showing the result: the button stays where it is. */
  let busy = false;

  function mount() {
    if (ui) {
      if (!ui.host.isConnected) document.documentElement.append(ui.host);
      return ui;
    }
    const host = document.createElement(HOST_NAME);
    host.setAttribute('style', HOST_STYLE);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const button = document.createElement('button');
    button.type = 'button';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    button.append(icon, label);
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.setAttribute('role', 'status');
    shadow.append(style, button, tip);
    // Keep the page from reacting to clicks on the button (opening the link under it, closing a lightbox…).
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) {
      host.addEventListener(type, (e) => e.stopPropagation());
    }
    button.addEventListener('click', (e) => {
      e.preventDefault();
      void copy();
    });
    document.documentElement.append(host);
    ui = { host, button, icon, label, tip };
    render('idle');
    return ui;
  }

  function render(state: State, message = '') {
    if (!ui) return;
    ui.button.dataset.state = state;
    ui.label.textContent = LABELS[state];
    ui.button.title = message || (state === 'idle' ? '复制图片（可粘贴到任意网站）' : '');
    ui.icon.replaceChildren(
      ...ICONS[state].map((d) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        return path;
      }),
    );
    ui.tip.textContent = message;
    ui.tip.classList.toggle('show', !!message);
  }

  /** Puts the button in the visible part of the picture's top-right corner; false if there's no room. */
  function place(): boolean {
    if (!ui || !picture?.isConnected) return false;
    // The viewport without scrollbars, which is what `position: fixed` measures from.
    const vw = document.documentElement.clientWidth || innerWidth;
    const vh = document.documentElement.clientHeight || innerHeight;
    const r = picture.getBoundingClientRect();
    const top = Math.max(r.top, 0);
    const right = Math.min(r.right, vw);
    if (Math.min(r.bottom, vh) - top < 48 || right - Math.max(r.left, 0) < 72) return false;
    Object.assign(ui.button.style, { top: `${top + INSET}px`, right: `${vw - right + INSET}px` });
    Object.assign(ui.tip.style, { top: `${top + INSET + 34}px`, right: `${vw - right + INSET}px` });
    return true;
  }

  function show(el: Element) {
    clearTimeout(hideTimer);
    picture = el;
    const { button } = mount();
    if (place()) button.classList.add('show');
    else hide();
  }

  function hide() {
    clearTimeout(hideTimer);
    picture = null;
    ui?.button.classList.remove('show');
  }

  function scheduleHide() {
    if (busy || !picture) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  }

  function update() {
    frame = 0;
    if (!active || busy) return;
    if (!pointer) return scheduleHide();
    const { x, y, target } = pointer;
    if (ui && target === ui.host) {
      clearTimeout(hideTimer);
      return;
    }
    if (picture && target === lastTarget && contains(picture, x, y)) {
      point = { x, y };
      return;
    }
    lastTarget = target;
    const found = pictureAt(x, y);
    if (!found) return scheduleHide();
    point = { x, y };
    if (found !== picture || !ui?.button.classList.contains('show')) show(found);
    else if (!place()) hide();
  }

  function schedule() {
    if (active) frame ||= requestAnimationFrame(update);
  }

  async function copy() {
    const target = picture;
    if (busy || !target) return;
    busy = true;
    clearTimeout(hideTimer);
    clearTimeout(resetTimer);
    render('busy');
    let state: State = 'done';
    let message = '';
    try {
      if (isExtensionContextLost()) throw new Error('扩展已更新，请刷新页面后重试');
      const srcUrl = target instanceof HTMLImageElement ? target.currentSrc || target.src : undefined;
      const request: CopyImageMessage = { type: EXPORT_IMAGE_COPY, candidates: await resolveImages({ ...point, target }, srcUrl) };
      const res = (await browser.runtime.sendMessage(request)) as CopyImageResponse | undefined;
      if (!res) throw new Error('扩展已更新，请刷新页面后重试');
      if ('error' in res) throw new Error(res.error);
    } catch (err) {
      state = 'error';
      message = err instanceof Error ? err.message : String(err);
    }
    if (ctx.isInvalid) return;
    render(state, message);
    resetTimer = setTimeout(
      () => {
        busy = false;
        render('idle');
        // Re-check what's under the mouse now.
        lastTarget = null;
        schedule();
      },
      state === 'done' ? DONE_MS : ERROR_MS,
    );
  }

  ctx.addEventListener(
    window,
    'pointermove',
    (e) => {
      if (!active || e.pointerType === 'touch') return;
      // Dragging (selecting text, moving things) is not hovering; pressing the button itself is fine.
      pointer = e.buttons && e.target !== ui?.host ? null : { x: e.clientX, y: e.clientY, target: e.target };
      schedule();
    },
    { capture: true, passive: true },
  );
  const recheck = () => {
    if (!pointer) return;
    // The page moved under a still mouse.
    pointer = { ...pointer, target: null };
    schedule();
  };
  ctx.addEventListener(document, 'scroll', recheck, { capture: true, passive: true });
  ctx.addEventListener(window, 'resize', recheck);
  ctx.addEventListener(document, 'mouseout', (e) => {
    if (e.relatedTarget) return;
    // The mouse left the window.
    pointer = null;
    scheduleHide();
  });
  ctx.addEventListener(window, 'blur', () => scheduleHide());
  ctx.onInvalidated(() => {
    cancelAnimationFrame(frame);
    clearTimeout(hideTimer);
    clearTimeout(resetTimer);
    ui?.host.remove();
  });

  return {
    setActive(next: boolean) {
      active = next;
      if (!next) hide();
    },
  };
}
