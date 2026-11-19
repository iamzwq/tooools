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
