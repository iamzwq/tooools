import '@/assets/content-ui.css';
import '@/features/assistant/ui/assistant.css';
import ReactDOM from 'react-dom/client';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { getAssistantBridge } from '@/features/assistant/bridge';
import { Assistant } from '@/features/assistant/ui/Assistant';
import { parseVideoUrl } from '@/features/video-summary/sites';
import { AssistantStore } from '@/features/video-summary/ui/store';
import { loadContentScriptCss } from '@/utils/content-script-css';

/** Our shadow root is open, so page scripts could click our buttons; only the user's own clicks count. */
const USER_ONLY_EVENTS = ['click', 'auxclick', 'dblclick', 'contextmenu'];
const HOST_NAME = 'tooools-assistant';

function dropScriptedEvent(event: Event) {
  if (event.isTrusted) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** 小T and the video summary panel; the `assistant` script has the background inject this where needed. */
export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  // Styles are loaded through the background, see loadContentScriptCss().
  cssInjectionMode: 'manual',
  async main(ctx) {
    const bridge = getAssistantBridge();
    if (!bridge || bridge.ctx.isInvalid) return;
    ctx.onInvalidated(bridge.ctx.onInvalidated(() => ctx.abort()));

    const store = new AssistantStore();
    store.setRef(parseVideoUrl(location.href));
    // B站 and YouTube are single-page apps: follow in-app navigation between videos.
    ctx.addEventListener(window, 'wxt:locationchange', (event) => store.setRef(parseVideoUrl(event.newUrl)));
    // Don't leave a summary streaming (and using up tokens) once the UI is gone.
    ctx.onInvalidated(() => store.stop());

    const ui = await createShadowRootUi(ctx, {
      name: HOST_NAME,
      position: 'inline',
      anchor: 'html',
      css: await loadContentScriptCss(),
      // Keep typing and right-clicks in our UI away from the site's handlers.
      isolateEvents: ['keydown', 'keyup', 'keypress', 'contextmenu'],
      onMount(container, shadow, host) {
        for (const type of USER_ONLY_EVENTS) shadow.addEventListener(type, dropScriptedEvent, true);
        const root = ReactDOM.createRoot(container);
        root.render(<Assistant store={store} host={host} requests={bridge.requests} visibility={bridge.visibility} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    if (ctx.isInvalid) return;
    // Running copies removed theirs when this one started; any left are from copies that can't run
    // anymore (Firefox stops the old scripts on an update but keeps their elements on the page).
    document.querySelectorAll(HOST_NAME).forEach((host) => host.remove());
    ui.mount();
  },
});
