export const ASSISTANT_FEATURE_ID = 'assistant';

/** Popup → content script: replies `AssistantPageStatus`; no reply means the script isn't on the page. */
export const ASSISTANT_STATUS = 'assistant:status';
/** Popup → content script: show 小T again after it was hidden on this page. */
export const ASSISTANT_SHOW = 'assistant:show';
/** Content script → background: open the options page (content scripts can't do it themselves). */
export const ASSISTANT_OPEN_OPTIONS = 'assistant:open-options';
/** Content script → background: start another Tooools page tool on this tab. */
export const ASSISTANT_RUN_TOOL = 'assistant:run-tool';
/** `assistant` content script → background: inject the `assistant-ui` script (React, styles) into its frame. */
export const ASSISTANT_LOAD_UI = 'assistant:load-ui';

export type AssistantToolId = 'element-eraser' | 'layout-xray' | 'css-inspector';

export interface RunToolResult {
  ok: boolean;
  error?: string;
}

export interface AssistantPageStatus {
  /** Hidden on this page until it reloads. */
  hidden: boolean;
}
