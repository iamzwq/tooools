import { browser } from 'wxt/browser';
import { getLayoutXraySettings, type LayoutXrayMode } from './settings';

const STYLE_ATTR = 'data-tooools-layout-xray';
const DEPTH = 12;
const PALETTE = [
  '239, 68, 68',   // red
  '245, 158, 11',  // amber
  '34, 197, 94',   // green
  '6, 182, 212',   // cyan
  '59, 130, 246',  // blue
  '168, 85, 247',  // purple
];

export function buildLayoutXrayCss(mode: LayoutXrayMode): string {
  const rules: string[] = [];
  for (let level = 0; level < DEPTH; level++) {
    const color = PALETTE[level % PALETTE.length];
    const selector = `body ${'* '.repeat(level)}*:not(tooools-css-inspector)`;
    const decls: string[] = [];
    if (mode === 'outline' || mode === 'both') {
      decls.push(`outline: 1px solid rgba(${color}, 0.85) !important;`, 'outline-offset: -1px !important;');
    }
    if (mode === 'tint' || mode === 'both') {
      const alpha = mode === 'both' ? 0.08 : 0.16;
      decls.push(`background-color: rgba(${color}, ${alpha}) !important;`);
    }
    rules.push(`${selector} { ${decls.join(' ')} }`);
  }
  return rules.join('\n');
}

/** Runs in the page; toggles the injected `<style>` tag and returns whether X-ray is now active. */
function toggleInPage(attr: string, css: string): boolean {
  const existing = document.querySelector(`style[${attr}]`);
  if (existing) {
    existing.remove();
    return false;
  }
  const style = document.createElement('style');
  style.setAttribute(attr, '1');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  return true;
}

/** Runs in the page; updates the stylesheet only if X-ray is currently active. */
function updateInPage(attr: string, css: string): boolean {
  const existing = document.querySelector(`style[${attr}]`);
  if (!existing) return false;
  existing.textContent = css;
  return true;
}

function queryInPage(attr: string): boolean {
  return !!document.querySelector(`style[${attr}]`);
}

export async function toggleLayoutXray(tabId: number): Promise<boolean> {
  const { mode } = await getLayoutXraySettings();
  const css = buildLayoutXrayCss(mode);
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      args: [STYLE_ATTR, css],
      func: toggleInPage,
    });
    return Boolean(result?.result);
  } catch {
    throw new Error('当前页面不支持布局透视（浏览器内置页面、扩展商店等受保护页面无法注入样式）');
  }
}

export async function updateLayoutXray(tabId: number, mode: LayoutXrayMode): Promise<void> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      args: [STYLE_ATTR, buildLayoutXrayCss(mode)],
      func: updateInPage,
    });
  } catch {
    // Ignore protected pages when merely changing settings.
  }
}

export async function isLayoutXrayActive(tabId: number): Promise<boolean> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      args: [STYLE_ATTR],
      func: queryInPage,
    });
    return Boolean(result?.result);
  } catch {
    return false;
  }
}
