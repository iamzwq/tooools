import type { Plugin } from 'vite';

/**
 * Minifiers drop the unit from a zero initial value, which the registered type puts back. A plain variable
 * keeps the bare `0`, which breaks e.g. Tailwind's `calc(2px + var(--tw-ring-offset-width))`.
 */
const ZERO_BY_SYNTAX: Record<string, string> = {
  '<length>': '0px',
  '<length-percentage>': '0px',
  '<percentage>': '0%',
  '<angle>': '0deg',
  '<time>': '0s',
};

/**
 * Turns `@property` rules into plain initial values on every element.
 *
 * Content-script UIs render in shadow roots, where `@property` doesn't work, so WXT moves those rules
 * into the host page. There Tailwind v4's typed registrations (e.g. `--tw-gradient-from` as a `<color>`)
 * break sites built with Tailwind v3, whose values don't match. Setting the initial values on our own
 * elements instead is what Tailwind itself does for browsers without `@property`.
 */
export function inlineAtPropertyDefaults(css: string): string {
  const own: string[] = [];
  const inherited: string[] = [];
  const stripped = css.replace(/@property\s*(--[\w-]+)\s*\{([^}]*)\}/g, (_rule, name: string, body: string) => {
    const syntax = body.match(/syntax\s*:\s*"([^"]*)"/)?.[1] ?? '*';
    const value = body.match(/initial-value\s*:\s*([^;]+)/)?.[1]?.trim() ?? 'initial';
    const initial = (value === '0' && ZERO_BY_SYNTAX[syntax]) || value;
    (/inherits\s*:\s*true/.test(body) ? inherited : own).push(`${name}:${initial}`);
    return '';
  });
  if (!own.length && !inherited.length) return css;
  const rules = [
    // WXT rewrites :root to :host when it loads the CSS into the shadow root.
    inherited.length ? `:root{${inherited.join(';')}}` : '',
    own.length ? `*,:before,:after,::backdrop{${own.join(';')}}` : '',
  ];
  // Tailwind declares the `properties` layer first, so utilities still override these.
  return `${stripped}\n@layer properties{${rules.join('')}}\n`;
}

/** Applies `inlineAtPropertyDefaults` to the CSS of content scripts (which WXT builds to `content-scripts/`). */
export function contentScriptCss(): Plugin {
  return {
    name: 'tooools:content-script-css',
    // After Vite's CSS plugin, which emits the stylesheet in its own generateBundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && /^content-scripts\/.+\.css$/.test(file.fileName)) {
          file.source = inlineAtPropertyDefaults(String(file.source));
        }
      }
    },
  };
}
