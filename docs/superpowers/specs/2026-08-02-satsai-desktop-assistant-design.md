# SatsAi 智能体桌面助手 - 设计文档

> 创建日期: 2026-08-02 | 状态: 设计中 → 待实现

## 1. 项目概述

**SatsAi** 是一个基于 Electron 的 Windows 桌面智能助手，支持中英双语语音交互。用户通过自定义唤醒词唤醒助手，经声纹验证后，可通过自然语言操控电脑执行日常办公任务。

### 核心目标

- 随时待机，通过语音唤醒词激活
- 声纹安全验证，仅响应授权用户
- 自然语言操控电脑（应用、输入、网页、系统）
- 拟物角色风格的悬浮球 UI，亲和可爱
- MCP 协议扩展，能力可无限扩展
- 上传 GitHub 进行版本管理

### 非目标 (YAGNI)

- 不支持 macOS / Linux（仅 Windows）
- 不支持多用户（单用户声纹验证）
- 不支持离线 LLM（核心智能走云端 API）
- 不内置复杂的 RPA 工作流编排

---

## 2. 系统架构

### 2.1 分层架构

```
┌─────────────────────────────────────────┐
│              交互层 (Renderer)            │
│  悬浮球 UI · 设置面板 · 对话气泡 · 动画   │
├─────────────────────────────────────────┤
│             核心引擎层 (Main Process)     │
│  唤醒词 · VAD · 声纹 · 对话管理 · 执行器  │
├─────────────────────────────────────────┤
│             云端服务层 (API)              │
│  STT (Whisper) · LLM (Claude/GPT) · TTS │
├─────────────────────────────────────────┤
│              系统层 (Windows)            │
│  Win32 API · PowerShell · UIAutomation   │
└─────────────────────────────────────────┘
```

### 2.2 数据流

```
唤醒词检测 → VAD 截取语音 → 声纹验证 → STT 转文本
    → LLM 意图解析（含 Function Calling） → 执行动作 + 生成回复
    → TTS 语音播报 → 回到待机
```

### 2.3 状态机

| 状态 | 触发条件 | 行为 |
|------|----------|------|
| **待机 (Idle)** | 默认状态 | 悬浮球半透明，安静等待唤醒词 |
| **聆听 (Listening)** | 唤醒词 / 双击 | 声波动画，VAD 收音直到用户说完 |
| **处理 (Thinking)** | VAD 端点检测完成 | 旋转加载动画，声纹+识别+LLM 处理 |
| **回复 (Speaking)** | LLM 返回结果 | 对话气泡+TTS 播报，播完回收 |

---

## 3. 核心技术选型

| 层级 | 技术 | 用途 |
|------|------|------|
| 桌面框架 | Electron 28+ | 透明窗口、系统托盘、自动启动、全局快捷键 |
| 前端渲染 | React 18 + TypeScript + Zustand | 悬浮球 UI、设置面板、状态管理 |
| 主进程 | Node.js + TypeScript | 引擎调度、IPC、原生模块调用 |
| 唤醒词 | Porcupine (Picovoice) | 本地实时唤醒词检测，低功耗 |
| VAD | Silero VAD | 语音活动检测，端点精确切割 |
| 声纹 | Speaker Embedding (ECAPA-TDNN) | 本地声纹提取与比对，隐私安全 |
| 语音识别 | Whisper API / Azure STT | 云端高精度多语言识别 |
| 大模型 | Claude API / OpenAI API | Function Calling 意图解析与回复生成 |
| 语音合成 | Edge TTS / Azure TTS | 云端高质量语音合成 |
| 本地存储 | better-sqlite3 + electron-store | 对话历史、配置、声纹加密存储 |
| MCP 客户端 | @modelcontextprotocol/sdk | 工具扩展与第三方集成 |
| 打包 | electron-builder | Windows 安装包 (.exe / .msi) |

---

## 4. 功能模块设计

### 4.1 悬浮球 UI

- **视觉风格**: 拟物角色（可爱 AI 角色，有眼睛和微表情）——用户在方案 A/B/C 中选择 B
- **行为**:
  - 语音唤醒词激活（自定义）
  - 双击悬浮球进入聆听
  - 拖动自由移动，靠边自动吸附
  - 右键弹出设置菜单
  - 闲置 30 秒自动回收待机
  - 说"退下"手动结束对话

### 4.2 声纹录入与验证

**录入流程:**
1. 显示 3-5 句随机短语，用户逐句朗读录音（约 30 秒音频）
2. 本地提取 Speaker Embedding 向量
3. 加密保存至本地，永不上传云端

**验证流程:**
1. 唤醒后 VAD 截取语音段
2. 实时提取声纹向量与已注册向量比对（余弦相似度）
3. 相似度 ≥ 阈值 → 继续处理；< 阈值 → 静默忽略

**管理功能:**
- 重新录入声纹
- 安全阈值调节（宽松 ↔ 严格）
- 删除已注册声纹

### 4.3 桌面操控 (B 级：日常办公)

| 类别 | 能力 | 实现方式 |
|------|------|----------|
| 应用管理 | 打开/关闭/切换/分屏 | ShellExecute + Win32 API |
| 文字输入 | 语音转文字、模拟键盘 | SendKeys / SendInput |
| 网页浏览 | 打开URL、搜索、滚动 | ShellExecute + 浏览器控制 |
| 系统工具 | 截图、音量、亮度、WiFi | PowerShell + Win32 API |
| 日程助理 | 提醒、闹钟、待办 | 本地定时器 + 通知 |
| 智能问答 | 屏幕问答、翻译、总结 | LLM + 截屏 |
| 文件操作 | 查找、移动、读写 | MCP: Filesystem |

### 4.4 MCP 扩展

内置 MCP 客户端，预置 Server:
- **Filesystem MCP** — 文件读写、目录操作
- **SQLite MCP** — 本地数据库查询
- **GitHub MCP** — Issue/PR/代码管理
- **Shell MCP** — PowerShell 脚本执行
- 支持用户自定义添加 MCP Server (JSON 配置)

### 4.5 LLM Function Calling 架构

LLM 将自然语言指令解析为结构化的 Function Call:

```
内置 Actions:       open_app | close_app | switch_window | snap_window |
                    type_text | press_keys | click_at | scroll |
                    open_url | search_web | read_clipboard | write_clipboard |
                    screenshot | set_volume | system_info |
                    create_reminder | ask_llm | read_screen_content

MCP Tools:          由各 MCP Server 动态注册到 LLM 工具列表
```

桌面 Actions 和 MCP Tools 统一注入 LLM 的 tools 参数，由模型决定调用顺序。

---

## 5. 项目目录结构

```
sats-ai/
├── electron/                  # Electron 主进程
│   ├── main.ts                # 入口：窗口创建、生命周期
│   ├── tray.ts                # 系统托盘管理
│   ├── preload.ts             # 预加载脚本、安全暴露 API
│   └── ipc/                   # IPC 通信处理
│       ├── voice.ts           # 语音相关 IPC
│       ├── system.ts          # 系统操控 IPC
│       └── settings.ts        # 设置/声纹管理 IPC
├── src/                       # React 渲染进程
│   ├── App.tsx                # 根组件
│   ├── main.tsx               # React 入口
│   ├── components/
│   │   ├── FloatingBall/      # 悬浮球组件
│   │   ├── DialogBubble/      # 对话气泡组件
│   │   ├── SettingsPanel/     # 设置面板
│   │   ├── VoiceEnrollment/   # 声纹录入向导
│   │   └── WaveAnimation/     # 声波动画
│   ├── hooks/
│   │   ├── useVoiceState.ts   # 语音状态 hook
│   │   └── useDrag.ts         # 拖动 hook
│   └── stores/
│       └── appStore.ts        # Zustand 全局状态
├── engine/                    # 核心引擎 (Node.js)
│   ├── index.ts               # 引擎入口、生命周期管理
│   ├── hotword/               # 唤醒词检测
│   │   └── porcupine.ts       # Porcupine 封装
│   ├── speaker/               # 声纹模块
│   │   ├── enroll.ts          # 声纹录入
│   │   └── verify.ts          # 声纹验证
│   ├── vad/                   # 语音活动检测
│   │   └── silero.ts          # Silero VAD 封装
│   ├── stt/                   # 语音识别
│   │   └── client.ts          # Whisper API 客户端
│   ├── llm/                   # 大模型
│   │   ├── client.ts          # API 客户端（Claude/GPT）
│   │   └── tools.ts           # Function Calling 工具定义
│   ├── tts/                   # 语音合成
│   │   └── client.ts          # Edge TTS 客户端
│   ├── actions/               # 桌面操控执行器
│   │   ├── index.ts           # 执行器注册表
│   │   ├── app.ts             # 应用管理
│   │   ├── input.ts           # 键盘/输入
│   │   ├── system.ts          # 系统控制
│   │   └── web.ts             # 网页浏览
│   ├── mcp/                   # MCP 客户端
│   │   ├── client.ts          # MCP Client 管理器
│   │   ├── servers.ts         # 内置 Server 配置
│   │   └── registry.ts        # 工具注册表
│   └── dialog/                # 对话状态机
│       └── stateMachine.ts    # 核心状态流转
├── resources/                 # 静态资源
│   ├── models/                # 本地模型文件 (.ppn 唤醒词等)
│   └── assets/                # 图标、音效、角色动画帧
├── package.json
├── tsconfig.json
├── electron-builder.yml       # 打包配置
└── README.md
```

---

## 6. 关键设计决策

### 6.1 声纹隐私
声纹向量仅在本地提取和存储，使用 AES-256 加密保存，永不上传云端。验证过程同样在本地完成。

### 6.2 网络降级
当云端 API 不可用时（STT/LLM/TTS）：
- 向用户提示"网络不可用，请稍后再试"
- 基础本地指令（如音量调节、打开应用）可离线执行（后续版本考虑本地小模型）

### 6.3 性能
- 待机状态：仅唤醒词检测运行，CPU < 5%，内存 < 150MB
- 唤醒词检测：Porcupine 专为低功耗设计
- VAD 和声纹提取在收到完整语音段后执行，非持续运行

### 6.4 安全
- 声纹验证防非授权使用
- 敏感操作（删文件、执行脚本）需二次语音确认
- MCP Server 可选沙箱模式限制文件访问范围

---

## 7. 自审清单

| 检查项 | 状态 |
|--------|------|
| 无 TBD/TODO 占位符 | ✅ |
| 架构与功能描述一致 | ✅ |
| 范围适合单次实现 | ✅ (可分阶段) |
| 无模糊需求 | ✅ |
| 技术栈版本明确 | ✅ |
| 数据流完整 | ✅ |
| 安全/隐私说明 | ✅ |

---

## 8. 实现阶段规划

| 阶段 | 内容 | 优先级 |
|------|------|--------|
| Phase 1 | Electron 骨架 + 悬浮球 UI + 系统托盘 | P0 |
| Phase 2 | 唤醒词检测 + VAD + 声纹录入/验证 | P0 |
| Phase 3 | STT + LLM + TTS 集成 + 对话状态机 | P0 |
| Phase 4 | 桌面操控 Actions（应用/输入/系统） | P1 |
| Phase 5 | MCP 客户端 + 内置 Server | P1 |
| Phase 6 | 设置面板 + 声纹管理 UI | P1 |
| Phase 7 | 打包发布 + 自动更新 | P2 |
