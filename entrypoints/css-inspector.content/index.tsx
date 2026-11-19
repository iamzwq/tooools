import '@/assets/content-ui.css';
import ReactDOM from 'react-dom/client';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import Inspector from '@/features/css-inspector/Inspector';
import { CSS_INSPECTOR_START } from '@/features/css-inspector/messages';
import { onMessage } from '@/utils/messaging';

/** Injected on demand by `startCssInspector()`; stays loaded so later starts are just a message. */
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  cssInjectionMode: 'ui',
  async main(ctx) {
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
        name: 'tooools-css-inspector',
        position: 'inline',
        anchor: 'html',
        onMount(container, _shadow, host) {
          const wrapper = document.createElement('div');
          if (matchMedia('(prefers-color-scheme: dark)').matches) wrapper.classList.add('dark');
          container.append(wrapper);
          const root = ReactDOM.createRoot(wrapper);
          root.render(<Inspector host={host} onExit={stop} />);
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      ui.mount();
    };

    // Replying `true` tells startCssInspector() this script is already loaded.
    onMessage<{ type: typeof CSS_INSPECTOR_START }, true>(CSS_INSPECTOR_START, () => {
      void start();
      return true;
    });
    await start();
  },
});
