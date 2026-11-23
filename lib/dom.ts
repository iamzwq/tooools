/** Parent element, stepping out of (open) shadow roots to their host. */
export function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Like `Element.closest`, but continues past shadow root boundaries. */
export function closestDeep(el: Element, selector: string): Element | null {
  for (let node: Element | null = el; node; node = parentOf(node)) {
    if (node.matches(selector)) return node;
  }
  return null;
}

/** Short DevTools-style label, e.g. `div#app.card.shadow`. */
export function elementLabel(el: Element): string {
  let label = el.localName;
  if (el.id) label += `#${el.id}`;
  const classes = [...el.classList];
  label += classes.slice(0, 3).map((c) => `.${c}`).join('');
  if (classes.length > 3) label += '…';
  return label;
}
