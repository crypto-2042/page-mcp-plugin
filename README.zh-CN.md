<p align="center">
  <img src="src/assets/icon-128.png" alt="Page MCP Logo" width="80" />
</p>

<h1 align="center">Page MCP — AI 助手</h1>

<p align="center">
  一个浏览器扩展插件，自动发现网页暴露的 <a href="https://modelcontextprotocol.io">MCP</a> 能力，让 AI 能够精准读取页面资源并执行页面交互操作。
</p>

<p align="center">
  中文 · <a href="./README.md">English</a>
</p>

---

## 什么是 Page MCP？

**Page MCP** 是为 **Page MCP** 生态系统打造的 Chrome 浏览器扩展。它能够发现并连接网页通过 `@page-mcp/core` 暴露的 [Model Context Protocol (MCP)](https://modelcontextprotocol.io) 服务 —— 基于 **Anthropic MCP** 标准和 **WebMCP** 扩展协议构建 —— 并以此驱动浏览器内的丰富 AI 交互体验。

<p align="center">
  <img src="docs/page-mcp.jpg" alt="Page MCP 架构原理图" width="800" />
</p>

### 核心能力

| 能力 | 说明 |
|---|---|
| 🔍 **MCP 自动发现** | 自动检测网页中通过 `@page-mcp/core` 注册的 `PageMcpHost` 实例 |
| 🛠 **工具调用** | 代表 AI 调用页面暴露的 MCP 工具（如表单提交、数据查询、UI 操作等） |
| 📄 **资源读取** | 读取页面提供的 MCP 资源（结构化数据、文档、上下文）供 AI 消费 |
| 💬 **提示词快捷方式** | 呈现页面定义的 Prompt 模板，实现快速 AI 交互 |
| 🤖 **Chat UI 注入** | 向任意页面注入完整的 AI 对话组件，让不支持 AI 能力的站点也能使用 AI |
| 🔗 **远程 MCP/Skills** | 从远程仓库和市场安装并加载 MCP 工具包和 Skills 技能包 |

### 工作原理

```
┌──────────────────────────────────────────────────────┐
│  网页 (Web Page)                                     │
│  ┌──────────────────────────────────────────┐        │
│  │  @page-mcp/core  →  PageMcpHost          │        │
│  │  (暴露 tools / resources / prompts)       │        │
│  └──────────────────┬───────────────────────┘        │
│                     │  window.__pageMcpHosts          │
│                     ▼                                │
│  ┌──────────────────────────────────────────┐        │
│  │  Bridge 桥接脚本 (MAIN 世界)              │        │
│  │  window.postMessage  ⇄  host transport   │        │
│  └──────────────────┬───────────────────────┘        │
│                     │  postMessage                   │
│                     ▼                                │
│  ┌──────────────────────────────────────────┐        │
│  │  Content Script (ISOLATED 隔离世界)       │        │
│  │  MCP 发现 → Chat UI → AI 调用            │        │
│  └──────────────────┬───────────────────────┘        │
│                     │  chrome.runtime                │
└─────────────────────┼────────────────────────────────┘
                      ▼
               ┌──────────────┐
               │  Background  │ ← chrome.storage
               │  Service     │ ← API 代理
               │  Worker      │ ← MCP/Skills 仓库
               └──────────────┘
```

1. **Bridge 桥接脚本** 运行在页面的 `MAIN` 世界，通过 `window.__pageMcpHosts` 连接 `PageMcpHost`。
2. **Content Script** 运行在 `ISOLATED` 隔离世界，通过 `postMessage` 与 Bridge 通信，并注入 Chat UI。
3. **Background Service Worker** 负责设置持久化、API 代理调用以及远程仓库管理。

---

## 功能特性

### 🔍 智能 MCP 发现

扩展会自动扫描每个页面，检测通过 `@page-mcp/core` 注册的 MCP 主机。一旦检测到，会枚举所有可用的 **工具 (Tools)**、**提示词 (Prompts)** 和 **资源 (Resources)**，并在弹出面板中展示。

### 💬 Chat UI 注入

提供可配置的注入策略：

- **始终注入** — 在所有站点显示 Chat 组件，即使没有 MCP
- **资源驱动** — 当页面提供了 MCP 工具或资源时（通过 JSON-LD、meta 标签等）自动注入
- **仅手动** — 只通过扩展弹出面板激活

Chat 组件支持：
- 与 AI 进行多轮对话
- 自动 MCP 工具调用（带确认机制）
- Markdown 渲染与语法高亮
- 按域名隔离的对话历史
- 通过右键菜单把选中的页面文本作为上下文附加到聊天中，支持一次性草稿和按会话固定
- 明亮 / 暗黑 / 跟随系统 主题切换

### 🏪 远程 MCP/Skills 市场

从远程仓库安装预置的 MCP 工具包和 Skills 技能包：

- 从白名单市场源浏览和安装
- 按域名匹配 — 工具仅在匹配的站点上加载
- 版本追踪和完整性校验
- 在设置页面管理仓库

### 🔒 隐私与安全

- **纯本地存储** — API 密钥和对话记录不会离开你的浏览器
- **工具调用确认** — AI 执行页面工具前需要手动批准
- **敏感数据过滤** — 可选地在发送给 AI 前剥离敏感信息
- **本地加密** — 对存储的数据进行静态加密
- **自动清除** — 关闭标签页时自动清除对话历史

---

## 安装

### 前置条件

- **Node.js** ≥ 18
- **pnpm**（唯一支持的包管理器）
- **Chrome** 或基于 Chromium 的浏览器（Manifest V3）

### 从源码构建

```bash
# 1. 克隆仓库
git clone <repo-url>
cd page-mcp-plugin

# 2. 安装依赖
pnpm install

# 3. 构建扩展
pnpm build
```

### 加载到 Chrome

1. 在浏览器中打开 `chrome://extensions/`
2. 开启右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本项目的 `dist/` 目录

### 开发模式

```bash
# 监听模式 — 文件修改后自动重新构建
pnpm dev
```

运行 `pnpm dev` 后，在 `chrome://extensions/` 中重新加载扩展即可生效。

### 开发规则

- 仅使用 `pnpm`。本仓库不支持 `npm` 或 `bun` 工作流。
- 所有新增的用户可见文案都必须同时补齐 `en` 和 `zh` 国际化。
- 使用现有图标体系：content/popup 使用 `lucide-react`，options 保持 `MaterialSymbolIcon`，不要再用文本占位来冒充图标。

---

## 配置说明

点击扩展图标 → **选项** 打开设置页面。

### 通用设置

| 设置项 | 说明 |
|---|---|
| **自动检测并挂载** | 自动扫描并连接页面 MCP 主机 |
| **默认驻留模式** | 在所有站点显示 Chat 组件 |
| **资源驱动模式** | 检测到 MCP 资源时显示 Chat 组件 |
| **接管原生对话窗口** | 用 Page MCP 替换站点原生聊天窗口（按域名配置） |
| **界面语言** | 在中文和英文之间切换 |

### 模型 API

| 设置项 | 说明 |
|---|---|
| **API 密钥** | 你的 LLM 服务商 API 密钥（本地存储） |
| **API 请求源 (Base URL)** | API 端点（默认：`https://api.openai.com/v1`） |
| **模型选择** | 从自动获取的模型中选择或手动输入 |

### 界面定制

| 设置项 | 说明 |
|---|---|
| **主题模式** | 暗黑 / 明亮 / 跟随系统 |
| **点缀主色调** | Chat 组件的主色彩 |
| **悬浮球位置** | 右下、左下、右上、左上 |

### 隐私安全

| 设置项 | 说明 |
|---|---|
| **工具调用确认** | AI 执行工具前需要手动批准 |
| **敏感数据过滤** | 发送给 AI 前过滤敏感信息 |
| **本地加密** | 加密存储的数据 |
| **退出自动清除** | 关闭标签页时清除对话历史 |

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 运行时 | Chrome Extension Manifest V3 |
| 语言 | TypeScript |
| UI 框架 | React 19 |
| 样式 | Tailwind CSS 4 |
| 构建工具 | Vite 6 |
| MCP 协议 | `@page-mcp/core`、`@page-mcp/protocol`、`@page-mcp/webmcp-adapter` |
| Markdown | marked + DOMPurify + Turndown |
| 测试 | Vitest |

---

## 项目结构

```
page-mcp-plugin/
├── _locales/             # 国际化 (en, zh)
├── src/
│   ├── assets/           # 扩展图标
│   ├── background/       # Service Worker (设置、API代理、仓库管理)
│   ├── content/          # Content Script + Bridge (MCP发现、Chat UI)
│   ├── options/          # 设置页面 (React)
│   ├── popup/            # 弹出面板 (React)
│   └── shared/           # 共享类型、存储工具、常量
├── manifest.json         # Chrome 扩展清单文件
├── vite.config.ts        # 多目标 Vite 构建配置
└── package.json
```

---

## 给网站开发者

要让你的站点兼容 Page MCP，请集成 `@page-mcp/core` SDK：

```ts
import { PageMcpHost } from '@page-mcp/core';

const host = new PageMcpHost({
  name: '我的应用',
  version: '1.0.0',
});

// 注册工具
host.registerTool({
  name: 'search_products',
  description: '搜索商品目录',
  inputSchema: { /* JSON Schema */ },
  handler: async (args) => { /* ... */ },
});

// 注册资源
host.registerResource({
  uri: 'page://selector/.user-profile',
  name: '用户资料',
  description: '当前用户的信息',
});

host.registerPrompt({
  name: 'recommend-products',
  description: 'Start a product recommendation conversation.',
  messages: [
    {
      role: 'user',
      content: {
        type: 'text',
        text: 'Recommend three products from the current page.',
      },
    },
  ],
});
// 启动主机
host.start();
```

主机启动后，Page MCP 扩展会自动发现并连接到它。

---

## 许可证

MIT
