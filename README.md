# Tooools

日常使用电脑的浏览器小工具集合，基于 [WXT](https://wxt.dev/) + React + TypeScript + Tailwind CSS 构建，支持 Chrome / Edge 及 Firefox。

所有功能均可在扩展弹窗中**独立开关与配置**，关闭功能后对应的右键菜单与快捷键会自动停用。

## 安装

前往 [Releases](https://github.com/iamzwq/tooools/releases/latest) 下载最新版本的安装包：

- **Chrome / Edge**：下载 `tooools-<版本>-chrome.zip` 并解压，打开扩展管理页（`chrome://extensions` 或 `edge://extensions`），开启「开发者模式」，点击「加载已解压的扩展程序」，选择解压后的文件夹。
- **Firefox**：下载 `tooools-<版本>-firefox.zip`，打开 `about:debugging#/runtime/this-firefox`，点击「临时载入附加组件」并选择该 zip 文件（未签名扩展在 Firefox 重启后需重新载入）。

> 升级版本时，下载新包解压覆盖原文件夹后，在扩展管理页点击该扩展的「重新加载」即可，已有设置会保留。

## 已实现的功能

### 1. 导出 / 复制图片

在网页中的图片、`<img>`（支持 `<picture>` / `srcset` 优先取高清图）、CSS 背景图、`<svg>`、`<canvas>` 或视频封面（YouTube 自动获取最高清封面）上右键，提供以下操作：

- **导出图片**：支持导出为 **原格式 / PNG / JPG / WebP**
  - 目标格式与原图一致时直接保留原字节，无损不重新编码
  - 支持将 SVG 栅格化为 PNG / JPG / WebP
- **复制图片（可粘贴到任意网站）**：仅将 PNG 位图写入剪贴板，不附带源站 `<img src>` 链接，避免粘贴到编辑器时因防盗链、需登录或网络不可达导致的「图片加载失败」
- **可配置项**（在扩展弹窗中展开）：
  - JPG / WebP 质量（1–100，默认 `92`）
  - JPG 透明背景填充色（默认 `#ffffff`）
  - 每次询问保存位置（默认关闭）

### 2. 图片保存到 123云盘

在网页图片、背景图或视频封面上右键 **「保存图片到 123云盘」**，一键将图片转存至 123云盘：

- 自动同步浏览器中已登录的 123云盘网页端登录态，无需手动填写凭证；未登录时会自动打开 123云盘登录页
- 支持文件秒传检测，并通过系统通知反馈上传/秒传结果
- **可配置项**（在扩展弹窗中展开）：
  - 保存目标文件夹（留空则保存到根目录，指定文件夹不存在时自动创建）
  - 实时检测与手动刷新当前登录状态

### 3. 检查元素 CSS

快速查看网页任意元素的有效 CSS 样式，或将元素直接导出为图片：

- **启动方式**：
  - 网页右键菜单选择 **「检查元素 CSS」**
  - 使用快捷键（默认 `Alt+K`，可在弹窗中点击快捷键跳转至浏览器扩展快捷键设置修改）
  - 在扩展弹窗中点击该功能右侧的选取按钮一键启动
- **交互能力**：
  - 悬停实时高亮元素并显示元素标签与尺寸（支持穿透开放 Shadow DOM），按 `Esc` 退出
  - 点击选中元素后弹出可拖拽面板，查看提取的 CSS 样式并一键 **复制 CSS**
  - 支持在面板中向上/向下切换 **父元素 / 子元素**
  - 支持将选中元素 **导出图片（PNG）** 或 **复制图片（PNG）到剪贴板**（自动通过后台获取跨域图片/字体资源）

### 4. 布局透视

按 DOM 嵌套层级为页面所有元素着色高亮，快速查看布局边界、排查对齐与横向溢出：

- **切换方式**：
  - 网页右键菜单选择 **「布局透视（开/关）」**
  - 使用快捷键（默认 `Alt+L`，可在弹窗中点击快捷键跳转至浏览器扩展快捷键设置修改）
  - 在扩展弹窗中点击该功能右侧的开关按钮一键切换（按钮会反馈当前页是否已开启）
- **可配置项**（在扩展弹窗中展开，切换模式时若当前页已开启会实时更新）：
  - **描边**（默认）：按嵌套层级绘制 1px 彩色内描边（`outline-offset: -1px`，不破坏布局）
  - **填色**：按嵌套层级叠加半透明彩色背景
  - **混合**：描边 + 轻度半透明填色

### 5. 元素擦除

点选临时隐藏网页中不需要的元素（如广告浮窗、登录遮罩、侧边栏、页脚等），方便专注阅读、打印或截图前清场：

- **启动方式**：
  - 网页右键菜单选择 **「元素擦除（临时隐藏）」**
  - 使用快捷键（默认 `Alt+E`，可在弹窗中点击快捷键跳转至浏览器扩展快捷键设置修改）
  - 在扩展弹窗中点击该功能右侧的橡皮擦按钮一键启动
- **交互能力**：
  - 悬停红色虚线高亮目标元素并显示标签与尺寸，点击即临时隐藏（拦截页面点击事件，不会误触链接）
  - 底部悬浮工具条实时显示已隐藏数量，支持 **撤销**（`Ctrl+Z` / `Cmd+Z`）、**恢复全部** 以及 **完成**（`Esc`，退出擦除模式并保留隐藏效果以便打印或截图）
  - 再次进入擦除模式或展开弹窗选项均可一键恢复当前页已隐藏的全部元素

## 开发与构建

### 环境要求

- Node.js（建议使用 LTS 版本）

### 安装依赖

```bash
npm install
```

### 常用命令

```bash
# 开发模式（Chrome）
npm run dev

# 开发模式（Firefox）
npm run dev:firefox

# 生产构建（Chrome / Firefox）
npm run build
npm run build:firefox

# 打包为 zip（Chrome / Firefox）
npm run zip
npm run zip:firefox

# TypeScript 类型检查
npm run compile
```

### 本地加载扩展

1. 运行 `npm run build`（Chrome / Edge）或 `npm run build:firefox`（Firefox）。
2. 在浏览器打开扩展管理页（如 `chrome://extensions` 或 `edge://extensions`），开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择构建产物目录 `.output/chrome-mv3`。

### 发布新版本

推送 `v*` 格式的 tag 后，GitHub Actions（[`.github/workflows/release.yml`](.github/workflows/release.yml)）会自动类型检查、打包 Chrome / Firefox zip 并创建 GitHub Release。tag 必须与 `package.json` 中的版本号一致：

```bash
npm version 1.1.0 -m "chore: release v%s"   # 更新版本号、提交并创建 tag v1.1.0
git push origin main --follow-tags
```

## 项目结构

```text
├── entrypoints/           # 扩展入口（background、popup、content scripts、offscreen）
├── features/              # 功能模块（每个子目录对应一个独立功能）
│   ├── export-image/      # 导出 / 复制图片
│   ├── save-image-to-123pan/ # 图片保存到 123云盘
│   ├── css-inspector/     # 检查元素 CSS
│   ├── layout-xray/       # 布局透视
│   └── element-eraser/    # 元素擦除（临时隐藏）
├── components/            # 通用 UI 组件
├── lib/                   # 图片识别、图像处理与 DOM 工具库
├── utils/                 # 消息通信、通知、功能开关等公共工具
└── wxt.config.ts          # WXT 与 manifest 配置
```
