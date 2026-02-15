# OmniKit - 设计文档

## 概述

OmniKit 是一个开箱即用的 Tauri 桌面应用，作为 LLM API 中转网关，实现各厂商 API 格式的任意互转。用户无需部署服务器，启动应用即可对外提供中转服务。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 |
| 后端语言 | Rust |
| HTTP 服务 | Axum + Tokio |
| HTTP 客户端 | reqwest (流式) |
| 数据库 | SQLite + sqlx |
| 序列化 | serde + serde_json |
| 前端框架 | React 19 + TypeScript |
| UI 组件 | shadcn/ui + Tailwind CSS |
| 路由 | React Router |
| 图表 | Recharts |
| 构建工具 | Vite |
| 开源协议 | Apache 2.0 |

## 整体架构

```
┌─────────────────────────────────────────────────┐
│                  Tauri 桌面应用                    │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │         React + shadcn/ui 前端               │ │
│  │   管理界面 (渠道 / 模型 / 令牌 / 日志 / 统计) │ │
│  └──────────────────┬──────────────────────────┘ │
│                     │ Tauri IPC                   │
│  ┌──────────────────▼──────────────────────────┐ │
│  │              Rust 核心层                      │ │
│  │                                              │ │
│  │  ┌──────────┐  ┌──────┐  ┌───────────────┐  │ │
│  │  │ HTTP 代理 │  │ IR   │  │ 模态化        │  │ │
│  │  │ 服务器    │  │ 中间  │  │ Codec 引擎    │  │ │
│  │  │ (Axum)   │  │ 表示  │  │               │  │ │
│  │  └──────────┘  └──────┘  └───────────────┘  │ │
│  │                                              │ │
│  │  ┌──────────┐  ┌──────┐  ┌───────────────┐  │ │
│  │  │ 渠道路由  │  │ 日志 │  │ SQLite 存储    │  │ │
│  │  │ & 负载均衡│  │ 系统 │  │               │  │ │
│  │  └──────────┘  └──────┘  └───────────────┘  │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
         │
         │ 对外暴露 HTTP API (可配置端口)
         ▼
   外部客户端 / 应用
```

## 模态化架构

按模态 (Modality) 组织转换引擎，各模态拥有独立的 IR 和 Codec，互不干扰。

当前实现 chat 模态，未来可扩展 image / tts / asr / video。

```rust
enum Modality {
    Chat,
    Image,  // 未来
    Tts,    // 未来
    Asr,    // 未来
    Video,  // 未来
}

trait ModalityHandler {
    type Request;
    type Response;
    type StreamChunk;
    fn modality() -> Modality;
}

trait Decoder<M: ModalityHandler> {
    fn decode_request(raw: &RawRequest) -> Result<M::Request>;
    fn decode_response(raw: &[u8]) -> Result<M::Response>;
    fn decode_stream_chunk(chunk: &[u8]) -> Result<M::StreamChunk>;
}

trait Encoder<M: ModalityHandler> {
    fn encode_request(ir: &M::Request) -> Result<ProviderRequest>;
    fn encode_response(ir: &M::Response) -> Result<Vec<u8>>;
    fn encode_stream_chunk(chunk: &M::StreamChunk) -> Result<Vec<u8>>;
}
```

## Chat 模态 IR 定义

```rust
struct IrChatRequest {
    model: String,
    messages: Vec<IrMessage>,
    system: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    stream: bool,
    tools: Option<Vec<IrTool>>,
    metadata: HashMap<String, Value>,
}

struct IrMessage {
    role: IrRole,  // System / User / Assistant / Tool
    content: Vec<IrContentPart>,  // 支持多模态内容
}

struct IrStreamChunk {
    delta_text: Option<String>,
    delta_tool_call: Option<IrToolCallDelta>,
    finish_reason: Option<IrFinishReason>,
    usage: Option<IrUsage>,
}
```

## 首批支持的 Codec（chat 模态）

严格按照各厂商官方 API 文档实现：

| Codec | 路径 | 说明 |
|-------|------|------|
| openai-chat | `/v1/chat/completions` | OpenAI Chat Completions 格式 |
| openai-responses | `/v1/responses` | OpenAI Responses 格式 |
| anthropic | `/v1/messages` | Anthropic Messages API |
| gemini | 按 Gemini 官方文档 | Google Gemini API |
| moonshot | 按 Moonshot 官方文档 | Moonshot (Kimi) API |

## 流式传输管道

逐 chunk 实时转换，零缓冲：

```
上游 SSE chunk
    → Provider StreamDecoder → IrStreamChunk
    → 中间件 (日志 / Token 计数)
    → Target StreamEncoder → SSE 输出给客户端
```

- 使用 tokio 异步流，天然背压控制
- 各厂商 SSE 格式差异在各自 Decoder 中处理
- 上游错误转换为目标格式的错误结构返回

## 渠道路由 & 负载均衡

```rust
struct Channel {
    id: Uuid,
    name: String,
    provider: Provider,
    base_url: String,
    api_keys: Vec<ApiKey>,
    models: Vec<ModelMapping>,
    modalities: Vec<Modality>,
    priority: u32,       // 数字越小越优先
    weight: u32,         // 同优先级内的权重
    enabled: bool,
    key_rotation: bool,  // Key 轮询，默认关闭
    rate_limit: Option<RateLimit>,
}

struct ModelMapping {
    public_name: String,   // 对外暴露名称
    actual_name: String,   // 上游实际模型名
    modality: Modality,
}
```

- 同优先级内按权重加权随机分配
- 高优先级不可用时降级到低优先级
- 熔断：连续失败 N 次自动禁用，定时探活恢复
- Key 轮询：可选开启，触发限流时自动切换

## 对外 API 接口

```
基础地址: http://localhost:{配置端口}

请求头:
  Authorization: Bearer sk-omnikit-xxxxx
  X-Output-Format: anthropic          # 可选，指定输出格式

输出格式优先级:
  1. X-Output-Format 请求头
  2. ?output_format=xxx 查询参数
  3. 默认与输入格式保持一致
```

## 数据库设计 (SQLite)

### channels 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | 渠道名称 |
| provider | TEXT | openai / anthropic / gemini / moonshot |
| base_url | TEXT | API 端点 |
| priority | INTEGER | 优先级，默认 0 |
| weight | INTEGER | 权重，默认 1 |
| enabled | BOOLEAN | 默认 true |
| key_rotation | BOOLEAN | Key 轮询，默认 false |
| rate_limit | TEXT | JSON，可选 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### channel_api_keys 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| channel_id | TEXT FK | 关联渠道 |
| key_value | TEXT | 明文存储 |
| enabled | BOOLEAN | 默认 true |
| last_used | TIMESTAMP | |

### model_mappings 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| public_name | TEXT | 对外名称 |
| channel_id | TEXT FK | 关联渠道 |
| actual_name | TEXT | 上游模型名 |
| modality | TEXT | chat / image / tts / asr / video |

### tokens 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | 令牌名称 |
| key_value | TEXT UNIQUE | sk-omnikit-xxxxx |
| quota_limit | INTEGER | Token 额度上限，NULL 不限 |
| quota_used | INTEGER | 默认 0 |
| expires_at | TIMESTAMP | NULL 永不过期 |
| allowed_models | TEXT | JSON 数组，NULL 全部允许 |
| enabled | BOOLEAN | 默认 true |
| created_at | TIMESTAMP | |

### request_logs 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| token_id | TEXT | |
| channel_id | TEXT | |
| model | TEXT | |
| modality | TEXT | |
| input_format | TEXT | |
| output_format | TEXT | |
| status | INTEGER | HTTP 状态码 |
| latency_ms | INTEGER | |
| prompt_tokens | INTEGER | |
| completion_tokens | INTEGER | |
| request_body | TEXT | 可选 |
| response_body | TEXT | 可选 |
| created_at | TIMESTAMP | |

## 前端页面

| 页面 | 功能 |
|------|------|
| 仪表盘 | 总览卡片、请求趋势图、渠道用量饼图 |
| 渠道管理 | 渠道 CRUD、API Key 配置、连通性测试、启用/禁用 |
| 模型映射 | 公开名称与实际模型的映射管理 |
| 令牌管理 | 对外 API Key 生成/吊销/额度设置 |
| 请求日志 | 请求列表 + 详情展开、筛选搜索 |
| 用量统计 | 按天/周/月、按渠道/模型的 Token 和费用图表 |
| 系统设置 | 监听端口、日志保留天数、主题切换、数据导出 |

## 开源 & 分发

- 开源协议：Apache 2.0
- GitHub Actions CI/CD：PR 检查 + 多平台自动构建
- 发布产物：macOS .dmg (aarch64 + x86_64)、Windows .msi、Linux .AppImage/.deb
- Homebrew 安装：`brew tap <user>/omnikit && brew install omnikit`
- 单独 Homebrew Tap 仓库 `homebrew-omnikit`，release 时自动更新 formula

## 实现阶段

### 阶段一：项目骨架 & 基础设施

- Tauri v2 + React 19 + shadcn/ui 项目初始化
- SQLite + migration 搭建
- Axum HTTP 服务器嵌入 Tauri
- 前端布局框架（侧边栏 + 路由 + 亮暗主题）
- Tauri IPC 通信层

### 阶段二：核心转换引擎（chat 模态）

- IR 中间表示定义
- 5 个 Codec：openai-chat / openai-responses / anthropic / gemini / moonshot
- 流式转换管道
- 渠道路由 + 加权负载均衡 + 熔断
- 格式自动识别 + 输出格式指定

### 阶段三：管理功能

- 渠道管理页面
- 模型映射管理页面
- 令牌管理页面
- 请求日志页面
- 鉴权中间件

### 阶段四：统计 & 打磨

- 仪表盘
- 用量统计页面
- Key 轮询功能（可选）
- 日志自动清理
- 系统设置页面
- 数据导出
