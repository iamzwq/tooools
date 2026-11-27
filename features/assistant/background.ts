import { browser } from 'wxt/browser';
import { startCssInspector } from '@/features/css-inspector/start';
import { startElementEraser } from '@/features/element-eraser/start';
import { toggleLayoutXray } from '@/features/layout-xray/toggle';
import { getFeatureEnabledMap } from '@/utils/feature-settings';
import { onMessage } from '@/utils/messaging';
import { openOptionsPage, type OptionsSection } from '@/utils/options-page';
import {
  ASSISTANT_LOAD_UI,
  ASSISTANT_OPEN_OPTIONS,
  ASSISTANT_RUN_TOOL,
  type AssistantToolId,
  type RunToolResult,
} from './messages';

const TOOLS: Record<AssistantToolId, (tabId: number) => Promise<unknown>> = {
  'element-eraser': startElementEraser,
  'layout-xray': toggleLayoutXray,
  'css-inspector': startCssInspector,
};

export function setupAssistantBackground() {
  onMessage<{ type: typeof ASSISTANT_LOAD_UI }, true>(ASSISTANT_LOAD_UI, async (_message, sender) => {
    const tabId = sender.tab?.id;
    if (tabId == null) throw new Error('not sent from a tab');
    await browser.scripting.executeScript({
      target: { tabId, frameIds: [sender.frameId ?? 0] },
      files: ['/content-scripts/assistant-ui.js'],
    });
    return true as const;
  });

  onMessage<{ type: typeof ASSISTANT_OPEN_OPTIONS; section?: OptionsSection }, true>(ASSISTANT_OPEN_OPTIONS, async ({ section }) => {
    await openOptionsPage(section);
    return true as const;
  });

  onMessage<{ type: typeof ASSISTANT_RUN_TOOL; tool: AssistantToolId }, RunToolResult>(ASSISTANT_RUN_TOOL, async (message, sender) => {
    const run = TOOLS[message.tool];
    const tabId = sender.tab?.id;
    if (!run || tabId == null) return { ok: false, error: '无法在当前页面使用该工具' };
    if ((await getFeatureEnabledMap())[message.tool] === false) return { ok: false, error: '该工具已在扩展中关闭' };
    try {
      await run(tabId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
