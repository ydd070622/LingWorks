# LingWorks

> 一款基于 Electron + React 的桌面端 AI 工具箱，集成 20+ AI 平台入口、嵌入式智能体助手、Comfyui 云平台管理、DeepSeek 数据监控等功能。

![Version](https://img.shields.io/badge/version-3.2.9-blue) ![Platform](https://img.shields.io/badge/platform-Windows-green) ![License](https://img.shields.io/badge/license-MIT-yellow)

## 核心亮点

- **嵌入式智能体** — 在软件右侧面板 Ctrl+Space 随时呼出/收起，自动感知当前页面上下文
- **DeepSeek 深度打通** — 询问 Token 用量/费用时，智能体直接调 API 返回真实数据并跳转 Dashboard
- **多平台一站式** — 20+ AI 平台统一管理入口
- **Comfyui 云平台管理** — 端脑云、智算云扉、OneThingAI 卡片式管理，支持增删改
- **智能体面板可拖拽** — 拖动左侧边界调整宽度（340~610px），重启恢复默认
- **侧栏 10s 自动收起** — 闲置自动折叠为图标栏，标题栏按钮手动切换

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+Space | 呼出/收起智能体面板 |
| F12 | 打开开发者工具 |
| Ctrl+Shift+I | 打开开发者工具（备选） |

## 功能特性

### 嵌入式智能体助手

| 能力 | 说明 |
|------|------|
| 全局快捷键 | Ctrl+Space 随时呼出/收起，不依赖焦点 |
| 上下文感知 | 自动识别当前页面内容，精准回答 |
| 深度打通 | 支持 API 查询、跳转 Dashboard |
| 联网搜索 | web_search / web_fetch 实时搜索 |
| 文件操作 | 读取/创建/编辑本地文件 |
| 多会话 | 支持多个独立对话，历史记录持久化 |
| 拖拽调整 | 左侧边界拖拽调整宽度（340~610px） |
| 一键采用 | 智能体生成的提示词可一键填入输入框 |

### Comfyui 云端

端脑云、智算云扉、OneThingAI 三个 Comfyui 云平台以卡片形式集中管理，点击卡片直接打开对应平台，支持增删改。

### 侧栏导航

- 常用网站 — 常用 AI 平台快速入口
- 小红书工作台 — 小红书/聚光平台/创作者中心/专业号
- Comfyui 云端 — 端脑云、智算云扉、OneThingAI 卡片式管理
- 图像工坊 — 文生图/图生图/生成历史/Prompt 管理
- 控制台 — 开放平台/充值平台/数据看板/常用账号

侧栏支持 10 秒闲置自动折叠为图标栏，鼠标活动自动重置计时。也可通过标题栏左侧 PanelLeft 按钮手动切换。

### DeepSeek Monitor 数据面板

- 账户余额实时监控（API Key 验证）
- 本月 Token 用量趋势图
- 每日消费明细
- 历史月度消费柱状图

### 多平台入口

集成以下 AI 平台，统一管理入口：

- **对话类**：ChatGPT、Gemini、DeepSeek、Kimi、通义千问、智谱清言、MiniMax
- **图像类**：LibLib、RunningHub、TapNow
- **小红书聚光**：小红书、聚光平台、创作者中心、专业号（四合一入口）
- **其他**：OpenRouter、SiliconFlow、火山引擎等

### 其他功能

- **文生图 / 图生图** — 集成多种 AI 绘画模型
- **Prompt 管理** — 提示词模板库
- **生成历史** — AI 图片生成记录管理
- **右键菜单** — 选中文本快速搜索/翻译/发送给智能体
- **深色/浅色主题** — 支持跟随系统或手动切换
- **窗口管理** — 开机自启、最小化到托盘、自定义快捷键
- **常用账号** — 管理各平台账号信息
- **开放平台 / 充值平台** — 卡片式管理，支持添加自定义平台

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron 33.x | 桌面运行框架 |
| React 18 + TypeScript | 前端 UI 框架 |
| Vite 6.x | 开发服务器 & 构建 |
| electron-builder | Windows 安装包打包 |
| Lucide React | 图标库 |
| electron-store | 本地持久化存储 |

## 安装

### 下载预编译版本

前往 [Releases](https://github.com/ydd070622/AI-Web-Tools/releases) 下载最新的 Windows 安装包（.exe）。

### 从源码构建

```bash
git clone https://github.com/ydd070622/LingWorks.git
cd LingWorks
npm install
npm run dev     # 启动开发环境
npm run build   # 构建生产版本
npm run build:win  # 打包 Windows 安装包
```

安装包输出目录：release/

## 项目结构

```
LingWorks/
  electron/              # Electron 主进程
    main.ts              # 主进程入口
    preload.ts           # 预加载脚本
    ipc/                 # IPC 模块
    tool-handlers.ts     # 智能体工具执行
  src/                   # React 渲染进程
    components/          # UI 组件
      Sidebar.tsx        # 侧边栏导航
      WebViewPage.tsx    # WebView 页面容器
      AgentPanel.tsx     # 智能体面板
    pages/               # 页面
      ComfyuiPlatforms.tsx  # Comfyui 云平台管理
      Dashboard.tsx      # DeepSeek 数据面板
      Platforms.tsx      # 开放平台
      Recharge.tsx       # 充值平台
      ...
    services/            # 业务服务
    data/                # 静态数据
      platforms.ts       # 平台列表配置
    App.tsx              # 应用根组件
    main.tsx             # 渲染进程入口
  public/                # 静态资源
    favicons/            # 平台图标
    icons/               # 功能图标
  build/                 # 打包资源
```

## 许可

MIT
