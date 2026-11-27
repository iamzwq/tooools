import '@/assets/content-ui.css';
import Inspector from '@/features/css-inspector/Inspector';
import { CSS_INSPECTOR_START } from '@/features/css-inspector/messages';
import { createOverlayController } from '@/lib/shadow-ui';
import { onMessage } from '@/utils/messaging';

/** Injected on demand by `startCssInspector()`; stays loaded so later starts are just a message. */
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  // Styles are loaded through the background, see loadContentScriptCss().
  cssInjectionMode: 'manual',
  async main(ctx) {
    const overlay = createOverlayController(ctx, {
      name: 'tooools-css-inspector',
      render: (host, stop) => <Inspector host={host} onExit={stop} />,
    });

    // Replying `true` tells startCssInspector() this script is already loaded.
    onMessage<{ type: typeof CSS_INSPECTOR_START }, true>(CSS_INSPECTOR_START, () => {
      void overlay.start();
      return true;
    });
    await overlay.start();
  },
});
