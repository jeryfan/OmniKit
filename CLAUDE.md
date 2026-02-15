# OmniKit

LLM API 中转网关桌面应用，实现各厂商 API 格式任意互转。

## 项目概要

- **产品形态**: Tauri v2 桌面应用，开箱即用
- **核心能力**: 各 LLM 厂商 API 格式任意互转 (OpenAI / Anthropic / Gemini / Moonshot)
- **设计文档**: `docs/plans/2025-02-11-omnikit-design.md`

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 |
| 后端 | Rust, Axum, Tokio, reqwest, sqlx, serde |
| 数据库 | SQLite (WAL 模式) |
| 前端 | React 19, TypeScript, Vite |
| UI | shadcn/ui, Tailwind CSS, Recharts |
| 开源协议 | Apache 2.0 |

## 项目结构

```
src-tauri/src/
├── main.rs              # Tauri 入口
├── config.rs            # 应用配置
├── server/              # Axum HTTP 代理服务器
│   ├── router.rs        # 路由定义
│   ├── middleware.rs     # 鉴权、日志、限流中间件
│   └── proxy.rs         # 核心代理逻辑 & 流式转发
├── modality/            # 按模态组织的转换引擎
│   ├── mod.rs           # Modality trait 定义 (ModalityHandler, Decoder, Encoder)
│   └── chat/            # 文本对话模态
│       ├── ir.rs        # Chat IR 中间表示
│       ├── openai_chat.rs
│       ├── openai_responses.rs
│       ├── anthropic.rs
│       ├── gemini.rs
│       └── moonshot.rs
├── routing/             # 渠道路由 & 负载均衡
│   ├── balancer.rs      # 加权随机 & 优先级
│   └── circuit.rs       # 熔断器
├── db/                  # SQLite 数据层
│   ├── models.rs        # 数据模型
│   └── migrations/      # Schema 迁移
└── commands/            # Tauri IPC 命令

src/                     # React 前端
├── pages/               # 页面组件
├── components/ui/       # shadcn/ui 组件
├── hooks/               # 自定义 hooks
└── lib/                 # 工具函数、Tauri IPC 封装
```

## 架构约定

### 模态化设计

所有 API 格式转换按模态 (Modality) 组织。每个模态拥有独立的 IR 中间表示。新增模态只需在 `modality/` 下新建目录并实现 `ModalityHandler`、`Decoder`、`Encoder` trait。

当前实现: `chat`。预留扩展: `image`, `tts`, `asr`, `video`。

### Codec 转换流程

```
输入请求 → Decoder 解码为 IR → Encoder 编码为上游请求
上游响应 → Decoder 解码为 IR → Encoder 编码为目标格式输出
```

所有厂商的 Codec 必须严格按照其官方 API 文档实现，不做任何自定义改造。

### 流式传输

逐 chunk 实时转换，零缓冲。使用 tokio 异步流，上游每产出一个 SSE event 立即转换转发。

### 渠道路由

- 同优先级内按权重加权随机
- 高优先级不可用时降级
- 熔断: 连续失败 N 次自动禁用，定时探活恢复
- Key 轮询: 可选功能，默认关闭

## 编码规范

### Rust

- 使用 `Result<T>` 和 `thiserror` 进行错误处理，避免 `unwrap()` / `expect()` 在非测试代码中出现
- 异步代码使用 tokio runtime
- 数据库操作使用 sqlx 的编译时查询检查
- API Key 明文存储（暂不加密）
- 新增厂商 Codec 时必须实现 Decoder 和 Encoder 两个 trait

### TypeScript / React

- 函数组件 + hooks，不使用 class 组件
- 使用 React Router 进行页面路由
- Tauri IPC 调用统一封装在 `src/lib/` 下
- UI 组件使用 shadcn/ui，样式使用 Tailwind CSS utility classes
- 图表使用 Recharts

### 通用

- 提交信息使用英文，格式: `type(scope): description`
- 完成修改后请勿提交代码
- 不要自行添加与当前任务无关的功能或重构
