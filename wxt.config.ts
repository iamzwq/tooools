import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { CSS_INSPECTOR_COMMAND, CSS_INSPECTOR_DEFAULT_SHORTCUT } from './features/css-inspector/messages';
import { ELEMENT_ERASER_COMMAND, ELEMENT_ERASER_DEFAULT_SHORTCUT } from './features/element-eraser/messages';
import { LAYOUT_XRAY_COMMAND, LAYOUT_XRAY_DEFAULT_SHORTCUT } from './features/layout-xray/messages';
import { contentScriptCss } from './lib/vite/content-script-css';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss(), contentScriptCss()],
  }),
  manifest: ({ browser }) => ({
    name: 'Tooools',
    description: '日常使用电脑的小工具集合',
    // Firefox only allows storage.sync for add-ons with a fixed ID, which temporary add-ons lack otherwise.
    ...(browser === 'firefox' ? { browser_specific_settings: { gecko: { id: 'tooools@iamzwq.github.io' } } } : {}),
    permissions: [
      'contextMenus',
      'storage',
      'notifications',
      'scripting',
      'declarativeNetRequestWithHostAccess',
      'downloads',
      // Write only the image bitmap to the clipboard (「复制图片」).
      'clipboardWrite',
      // Chrome MV3 service workers can't decode SVG; Firefox background pages have a DOM.
      ...(browser === 'firefox' ? [] : ['offscreen']),
    ],
    // Needed to download images from any site and call the 123云盘 API without CORS issues.
    host_permissions: ['<all_urls>'],
    // Users can rebind these on the browser's extension shortcuts page.
    commands: {
      [CSS_INSPECTOR_COMMAND]: {
        suggested_key: { default: CSS_INSPECTOR_DEFAULT_SHORTCUT },
        description: '检查元素 CSS：开始选取元素',
      },
      [LAYOUT_XRAY_COMMAND]: {
        suggested_key: { default: LAYOUT_XRAY_DEFAULT_SHORTCUT },
        description: '布局透视：切换当前页布局高亮',
      },
      [ELEMENT_ERASER_COMMAND]: {
        suggested_key: { default: ELEMENT_ERASER_DEFAULT_SHORTCUT },
        description: '元素擦除：开始临时隐藏元素',
      },
    },
  }),
});

