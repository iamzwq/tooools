import '@/assets/content-ui.css';
import Eraser, { createEraserStore } from '@/features/element-eraser/Eraser';
import {
  ELEMENT_ERASER_RESTORE,
  ELEMENT_ERASER_START,
  ELEMENT_ERASER_STATUS,
} from '@/features/element-eraser/messages';
import { createOverlayController } from '@/lib/shadow-ui';
import { onMessage } from '@/utils/messaging';

/** Injected on demand by `startElementEraser()`; keeps hidden elements stack across re-entries. */
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  // Styles are loaded through the background, see loadContentScriptCss().
  cssInjectionMode: 'manual',
  async main(ctx) {
    const store = createEraserStore();
    const overlay = createOverlayController(ctx, {
      name: 'tooools-element-eraser',
      render: (host, stop) => <Eraser host={host} store={store} onExit={stop} />,
    });

    onMessage<{ type: typeof ELEMENT_ERASER_START }, true>(ELEMENT_ERASER_START, () => {
      void overlay.start();
      return true;
    });
    onMessage<{ type: typeof ELEMENT_ERASER_STATUS }, number>(ELEMENT_ERASER_STATUS, () => store.getCount());
    onMessage<{ type: typeof ELEMENT_ERASER_RESTORE }, number>(ELEMENT_ERASER_RESTORE, () => store.restoreAll());

    await overlay.start();
  },
});
