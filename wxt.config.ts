import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Tooools',
    description: '日常使用电脑的小工具集合',
    permissions: [
      'contextMenus',
      'storage',
      'notifications',
      'scripting',
      'declarativeNetRequestWithHostAccess',
    ],
    // Needed to download images from any site and call the 123云盘 API without CORS issues.
    host_permissions: ['<all_urls>'],
  },
});

