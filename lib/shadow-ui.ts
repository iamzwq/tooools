import type { ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import { loadContentScriptCss } from '@/utils/content-script-css';

export interface OverlayController {
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Manages a toggleable Shadow DOM React overlay anchored to `<html>`,
 * syncing `prefers-color-scheme: dark` automatically.
 */
export function createOverlayController(
  ctx: ContentScriptContext,
  options: {
    name: string;
    render: (host: HTMLElement, stop: () => void) => ReactNode;
  },
): OverlayController {
  let ui: ShadowRootContentScriptUi<ReactDOM.Root> | undefined;
  let active = false;

  const stop = () => {
    active = false;
    ui?.remove();
  };

  const start = async () => {
    if (active) return;
    active = true;
    ui ??= await createShadowRootUi(ctx, {
      name: options.name,
      position: 'inline',
      anchor: 'html',
      css: await loadContentScriptCss(),
      onMount(container, _shadow, host) {
        const wrapper = document.createElement('div');
        if (matchMedia('(prefers-color-scheme: dark)').matches) wrapper.classList.add('dark');
        container.append(wrapper);
        const root = ReactDOM.createRoot(wrapper);
        root.render(options.render(host, stop));
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  };

  return { start, stop };
}
