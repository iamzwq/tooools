export type Declaration = [property: string, value: string];

export interface ExtractedRule {
  selector: string;
  declarations: Declaration[];
}

/**
 * Properties whose resolved value is the *used* (laid-out) value while the element is
 * rendered, e.g. `width: auto` reads back as `523.4px`. Reading them while the element
 * is `display: none` returns the authored computed value (`auto`, `50%`, ...) instead.
 */
const LAYOUT_PROPS = [
  'width', 'height', 'top', 'right', 'bottom', 'left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
];

/** Longhands folded into a shorthand (Chrome serializes these from computed style). */
const SHORTHANDS: [string, string[]][] = [
  ['margin', ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']],
  ['padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']],
  ['border-radius', ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']],
  ['gap', ['row-gap', 'column-gap']],
  ['overflow', ['overflow-x', 'overflow-y']],
  ['flex', ['flex-grow', 'flex-shrink', 'flex-basis']],
  ['background-position', ['background-position-x', 'background-position-y']],
  ['list-style', ['list-style-type', 'list-style-position', 'list-style-image']],
  ['text-decoration', ['text-decoration-line', 'text-decoration-style', 'text-decoration-color', 'text-decoration-thickness']],
  ['outline', ['outline-color', 'outline-style', 'outline-width']],
  ['transition', ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay', 'transition-behavior']],
];

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

const WEBKIT_ALLOWED = new Set([
  '-webkit-line-clamp', '-webkit-box-orient', '-webkit-text-fill-color', '-webkit-text-stroke-width',
  '-webkit-text-stroke-color', '-webkit-background-clip', '-webkit-font-smoothing',
]);

const SKIPPED = new Set(['transform-origin', 'perspective-origin']);

const ORDER = [
  'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'display', 'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
  'align-self', 'justify-items', 'justify-self', 'order', 'gap', 'grid',
  'box-sizing', 'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'padding', 'border', 'border-radius', 'outline', 'overflow',
  'font', 'line-height', 'letter-spacing', 'color', 'text', 'white-space', 'word', 'vertical-align',
  'background', 'box-shadow', 'opacity', 'filter', 'backdrop-filter', 'transform', 'transition', 'animation', 'cursor',
];

function isNoise(prop: string): boolean {
  // Custom properties are already resolved into the real values (and include Tailwind's registered vars).
  if (prop.startsWith('--')) return true;
  if (SKIPPED.has(prop)) return true;
  if (prop.startsWith('-webkit-')) return !WEBKIT_ALLOWED.has(prop);
  if (prop.startsWith('border-image') || prop.startsWith('animation-')) return true;
  // Logical properties duplicate their physical counterparts.
  return /(^|-)(block|inline)(-|$)/.test(prop) || /^border-(start|end)-(start|end)-radius$/.test(prop);
}

const BLOCKIFIED: Record<string, string> = {
  inline: 'block',
  'inline-block': 'block',
  'inline-flex': 'flex',
  'inline-grid': 'grid',
  'inline-table': 'table',
};

function isFlexOrGridChild(el: Element): boolean {
  const parent = el.parentElement;
  return !!parent && /flex|grid/.test(getComputedStyle(parent).display);
}

function snapshot(el: Element, view: Window): Map<string, string> {
  const cs = view.getComputedStyle(el);
  const values = new Map<string, string>();
  for (let i = 0; i < cs.length; i++) {
    const prop = cs.item(i);
    values.set(prop, cs.getPropertyValue(prop));
  }
  for (const [shorthand] of SHORTHANDS) values.set(`@${shorthand}`, cs.getPropertyValue(shorthand));
  for (const side of SIDES) values.set(`@border-${side}`, cs.getPropertyValue(`border-${side}`));
  values.set('@border', cs.getPropertyValue('border'));
  values.set('@animation', cs.getPropertyValue('animation'));

  const style = (el as HTMLElement).style as CSSStyleDeclaration | undefined;
  if (style) {
    const hadStyleAttr = el.hasAttribute('style');
    const prev = style.getPropertyValue('display');
    const prevPriority = style.getPropertyPriority('display');
    style.setProperty('display', 'none', 'important');
    for (const prop of LAYOUT_PROPS) {
      const key = prop === 'margin' || prop === 'padding' ? `@${prop}` : prop;
      values.set(key, cs.getPropertyValue(prop));
    }
    if (prev) style.setProperty('display', prev, prevPriority);
    else style.removeProperty('display');
    if (!hadStyleAttr && !el.getAttribute('style')) el.removeAttribute('style');
  }
  return values;
}

/** Renders a same-tag element in a blank document to learn the browser defaults. */
export class BaselineStyles {
  private readonly iframe: HTMLIFrameElement;
  private readonly cache = new Map<string, Map<string, string>>();

  constructor(container: Node) {
    this.iframe = document.createElement('iframe');
    this.iframe.setAttribute('aria-hidden', 'true');
    this.iframe.tabIndex = -1;
    this.iframe.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;visibility:hidden;pointer-events:none';
    container.appendChild(this.iframe);
    const doc = this.iframe.contentDocument;
    if (doc && doc.compatMode === 'BackCompat') {
      try {
        doc.open();
        doc.write('<!doctype html><html><head></head><body></body></html>');
        doc.close();
      } catch {
        // Trusted Types pages forbid document.write; quirks-mode defaults are close enough.
      }
    }
  }

  get(el: Element): Map<string, string> {
    const type = el.getAttribute('type') ?? '';
    const key = `${el.namespaceURI}|${el.localName}|${type}`;
    let values = this.cache.get(key);
    if (!values) {
      const doc = this.iframe.contentDocument!;
      const probe = doc.createElementNS(el.namespaceURI, el.localName);
      if (type) probe.setAttribute('type', type);
      doc.body.appendChild(probe);
      values = snapshot(probe, doc.defaultView!);
      probe.remove();
      this.cache.set(key, values);
    }
    return values;
  }

  destroy() {
    this.iframe.remove();
  }
}

export function extractRule(el: Element, baseline: BaselineStyles): ExtractedRule {
  const own = snapshot(el, window);
  const base = baseline.get(el);
  const changed = (prop: string) => own.get(prop) !== base.get(prop);
  const decls = new Map<string, string>();
  const handled = new Set<string>();

  for (const [shorthand, longhands] of SHORTHANDS) {
    for (const l of longhands) handled.add(l);
    const diff = longhands.filter(changed);
    if (diff.length === 0) continue;
    if (shorthand === 'outline' && own.get('outline-style') === 'none') continue;
    if (shorthand === 'text-decoration' && own.get('text-decoration-line') === 'none') {
      if (changed('text-decoration-line')) decls.set('text-decoration', 'none');
      continue;
    }
    const value = own.get(`@${shorthand}`);
    if (value) decls.set(shorthand, value);
    else for (const l of diff) decls.set(l, own.get(l)!);
  }

  const borderProps = SIDES.flatMap((s) => ['width', 'style', 'color'].map((p) => `border-${s}-${p}`));
  for (const p of borderProps) handled.add(p);
  // A color difference alone is just `currentColor` following `color` when there is no border.
  const sideChanged = (s: string) =>
    changed(`border-${s}-style`) ||
    changed(`border-${s}-width`) ||
    (own.get(`border-${s}-style`) !== 'none' && changed(`border-${s}-color`));
  if (SIDES.some(sideChanged)) {
    if (SIDES.every((s) => own.get(`border-${s}-style`) === 'none')) decls.set('border', 'none');
    else if (own.get('@border')) decls.set('border', own.get('@border')!);
    else {
      for (const s of SIDES) {
        if (!sideChanged(s)) continue;
        decls.set(`border-${s}`, own.get(`border-${s}-style`) === 'none' ? 'none' : own.get(`@border-${s}`)!);
      }
    }
  }

  if (own.get('animation-name') !== 'none' && changed('animation-name')) decls.set('animation', own.get('@animation')!);

  const color = own.get('color');
  const baseColor = base.get('color');
  const flexOrGridChild = isFlexOrGridChild(el);
  for (const [prop, value] of own) {
    if (prop.startsWith('@') || handled.has(prop) || isNoise(prop) || !changed(prop)) continue;
    // `currentColor` defaults (caret-color, outline-color, column-rule-color, ...) just repeat `color`.
    if (prop.endsWith('-color') && value === color && base.get(prop) === baseColor) continue;
    if (/^(column|row)-rule/.test(prop) && own.get(prop.replace(/-(color|width|style)$/, '-style')) === 'none') continue;
    if ((prop === 'min-width' || prop === 'min-height') && value === 'auto') continue;
    // Flex/grid items are blockified by the browser, not by the author.
    if (prop === 'display' && flexOrGridChild && BLOCKIFIED[base.get('display') ?? ''] === value) continue;
    decls.set(prop, value);
  }

  const declarations = [...decls].map(([p, v]) => [p, prettifyValue(v)] as Declaration);
  declarations.sort((a, b) => orderOf(a[0]) - orderOf(b[0]) || a[0].localeCompare(b[0]));
  return { selector: ruleSelector(el), declarations };
}

function orderOf(prop: string): number {
  const i = ORDER.findIndex((o) => prop === o || prop.startsWith(`${o}-`));
  return i === -1 ? ORDER.length : i;
}

export function prettifyValue(value: string): string {
  return value
    .replace(/rgba\(0, 0, 0, 0\)/g, 'transparent')
    .replace(/rgb\((\d+), (\d+), (\d+)\)/g, (_, r, g, b) =>
      `#${[r, g, b].map((n: string) => Number(n).toString(16).padStart(2, '0')).join('')}`,
    )
    .replace(/-?\d+\.\d{3,}/g, (n) => String(Number(Number(n).toFixed(2))));
}

/** A readable selector to paste into your own stylesheet: `#id`, `.a.b.c` or the tag. */
export function ruleSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const classes = [...el.classList].slice(0, 3);
  if (classes.length) return classes.map((c) => `.${CSS.escape(c)}`).join('');
  return el.localName;
}

export function formatRule({ selector, declarations }: ExtractedRule): string {
  const body = declarations.map(([p, v]) => `  ${p}: ${v};`).join('\n');
  return `${selector} {\n${body}\n}`;
}
