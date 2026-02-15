# 转换规则引擎设计

> 日期: 2026-02-15

## 背景

OmniKit 当前的 API 格式转换完全由硬编码的 Rust Codec 实现，每新增一个厂商需要写 Rust 代码并重新编译。为了让系统更灵活，引入用户可自定义的转换规则引擎，允许用户自行创建、编辑、导入导出转换规则，同时保留现有内置 Codec 的性能优势。

## 关键设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 规则表达形式 | 模板 + 表达式引擎 | 表达力与易用性的最佳平衡 |
| 表达式引擎 | JSONata | 专为 JSON-to-JSON 转换设计，语法简洁 |
| 与内置 Codec 共存方式 | 双轨并行 | 保留内置 Codec 性能优势，规则引擎提供灵活性 |
| 规则作用范围 | 格式定义（与 IR 对齐） | 复用 IR 架构，N 个格式只需 N 条规则 |
| 流式转换处理 | 流式模板可选 | 降低编写门槛，大多数场景非流式模板足够 |
| 导入导出格式 | 单条 JSON + 批量 ZIP | 轻量分享与批量备份兼顾 |
| 规则发现机制 | 本地管理 + 内置规则仓库 | 零运维，离线可用，开箱体验好 |

## 一、核心概念模型

系统引入 **Conversion Rule（转换规则）** 作为一等公民概念，取代当前仅由硬编码 Codec 承担的格式转换职责。

**规则的本质是一个"格式定义"**：它描述某种 API 格式如何与 Chat IR 互转。一条规则包含：

- **元信息**：名称、标识符（slug）、版本、描述、作者、标签
- **类型标记**：`system`（系统内置，不可编辑/删除）或 `user`（用户创建）
- **模态**：该规则适用的模态（当前仅 `chat`，未来可扩展）
- **模板集合**：4 个必填 + 2 个可选的 JSONata 表达式
  - `decode_request` — 输入请求 JSON → IR JSON（必填）
  - `encode_request` — IR JSON → 上游请求 JSON（必填）
  - `decode_response` — 上游响应 JSON → IR JSON（必填）
  - `encode_response` — IR JSON → 输出响应 JSON（必填）
  - `decode_stream_chunk` — 上游 SSE chunk → IR chunk（可选）
  - `encode_stream_chunk` — IR chunk → 输出 SSE chunk（可选）
- **辅助配置**：HTTP 相关的元数据，如认证头的构造方式、上游 URL 模板、Content-Type 等

用户创建的规则和系统内置规则地位平等，都可以在渠道配置中被选用。区别仅在于系统规则不可编辑删除，且随应用版本更新。

## 二、转换流程（双轨调度）

当请求到达代理服务器时，系统根据输入/输出格式决定走哪条路径：

**快路径（内置 Codec）**：如果输入格式和输出格式都有对应的硬编码 Rust Codec，直接使用现有的 Decoder/Encoder trait 实现。性能最优，行为与当前系统一致。

**灵活路径（JSONata 规则引擎）**：如果任一端涉及用户自定义规则，则通过 JSONata 引擎执行转换。

**混合路径**：输入端用用户规则 decode，输出端用内置 Codec encode（或反过来），完全兼容。因为两条路径共享同一个 IR，所以可以自由混搭。

调度逻辑伪代码：

```
fn get_decoder(format_id) -> DecoderKind:
    if has_builtin_codec(format_id):
        return BuiltinDecoder(codec)
    if rule = find_rule(format_id):
        return JsonataDecoder(rule)
    return Error("unknown format")
```

**流式处理的 fallback 机制**：当用户规则没有提供 `decode_stream_chunk` / `encode_stream_chunk` 模板时，系统将每个 SSE chunk 的 `data` 字段解析为 JSON，用非流式的 `decode_response` / `encode_response` 模板处理，将结果包装回 SSE 格式。这对大多数厂商有效，因为流式 chunk 的数据结构通常是非流式响应的子集。

## 三、数据模型

新增 `conversion_rule` 表：

```sql
CREATE TABLE conversion_rule (
    id            TEXT PRIMARY KEY,  -- UUID
    slug          TEXT NOT NULL UNIQUE,  -- 唯一标识符，如 "openai-chat", "my-custom-format"
    name          TEXT NOT NULL,
    description   TEXT,
    author        TEXT,
    version       TEXT NOT NULL DEFAULT '1.0.0',
    tags          TEXT,  -- JSON array, 如 ["chat", "openai-compatible"]
    rule_type     TEXT NOT NULL DEFAULT 'user',  -- "system" | "user"
    modality      TEXT NOT NULL DEFAULT 'chat',
    -- JSONata 模板
    decode_request       TEXT NOT NULL,
    encode_request       TEXT NOT NULL,
    decode_response      TEXT NOT NULL,
    encode_response      TEXT NOT NULL,
    decode_stream_chunk  TEXT,  -- 可选
    encode_stream_chunk  TEXT,  -- 可选
    -- HTTP 辅助配置
    http_config   TEXT,  -- JSON: { auth_header_template, url_template, content_type }
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
```

现有的 `Channel` 表的 `provider` 字段语义扩展：当前它是枚举值（`openai`/`anthropic`/`gemini`/`moonshot`），改为引用 `conversion_rule.slug`。内置 Codec 对应的 slug 预定义为 `openai-chat`、`anthropic`、`gemini`、`moonshot`、`openai-responses`，保持向后兼容。

路由入口侧同理：当前通过 URL 路径（`/v1/chat/completions`）硬编码判断输入格式，改为也支持通过 header 或查询参数指定规则 slug，同时保留现有路径作为快捷方式。

## 四、规则导入导出

### 单条规则导出格式（JSON）

```json
{
  "omnikit_rule": "1.0",
  "slug": "deepseek-chat",
  "name": "DeepSeek Chat API",
  "description": "DeepSeek 对话 API 格式转换",
  "author": "alice",
  "version": "1.0.0",
  "tags": ["chat", "openai-compatible"],
  "modality": "chat",
  "templates": {
    "decode_request": "{ ... JSONata 表达式 ... }",
    "encode_request": "{ ... }",
    "decode_response": "{ ... }",
    "encode_response": "{ ... }",
    "decode_stream_chunk": null,
    "encode_stream_chunk": null
  },
  "http_config": {
    "auth_header_template": "Bearer {{key}}",
    "url_template": "{{base_url}}/chat/completions",
    "content_type": "application/json"
  }
}
```

文件扩展名使用 `.omnikit.json`，便于系统识别和文件关联。

### 批量导出格式（ZIP）

文件名为 `omnikit-rules-export-{date}.zip`，内部结构：

```
rules/
├── deepseek-chat.omnikit.json
├── cohere-chat.omnikit.json
└── my-custom-format.omnikit.json
```

### 导入行为

- slug 冲突时提示用户选择：覆盖、跳过、或作为新规则导入（自动追加后缀）
- 系统规则（`rule_type=system`）不可被导入覆盖
- 导入前做基本校验：必填模板非空、JSONata 语法合法性检查

## 五、内置规则仓库

应用内置一个规则索引，用户可以在 UI 中浏览推荐规则并一键安装。

### 索引来源

项目 GitHub 仓库中维护一个 `rules/` 目录：

```
rules/
├── index.json          -- 规则索引清单
├── deepseek-chat.omnikit.json
├── cohere-chat.omnikit.json
├── zhipu-glm.omnikit.json
└── ...
```

`index.json` 包含所有可用规则的摘要信息（slug、名称、描述、版本、标签），不包含模板内容，体积小，拉取快。

### 更新机制

- 应用启动时异步拉取 `index.json`（通过 GitHub Raw URL），与本地缓存对比
- 仅在用户主动点击"安装"或"更新"时才下载完整规则文件
- 完全离线可用——拉取失败不影响任何功能，只是仓库列表不刷新
- 无后端服务依赖，零运维

### 随版本内置

每次应用发版时，将当前 `rules/` 目录的内容打包进应用资源，作为离线规则仓库的初始数据。即使用户从未联网，也有一批开箱可用的社区规则。

## 六、前端 UI 设计

新增 **"转换规则"** 页面（`/rules`），作为侧边栏一级导航项，包含两个 tab：

### "我的规则" tab

- 表格列出所有本地规则（系统内置 + 用户自定义），显示名称、slug、模态、类型标签（`系统`/`自定义`）、启用状态
- 系统规则行标记为只读，可查看但不可编辑删除
- 操作：新建、编辑、复制（基于现有规则创建副本）、删除、导出
- 顶部工具栏：导入按钮（支持拖拽 `.omnikit.json` 或 `.zip`）、批量导出按钮

### "规则仓库" tab

- 卡片列表展示可安装的社区规则，显示名称、描述、作者、标签
- 标签筛选栏（chat / image / openai-compatible 等）
- 每张卡片带"安装"按钮，已安装的显示版本号和"更新"按钮

### 规则编辑器

- 打开为全屏对话框或独立页面
- 左侧：元信息表单（名称、slug、描述、标签、HTTP 配置）
- 右侧：6 个模板编辑区，使用代码编辑器组件（Monaco 或 CodeMirror），提供 JSONata 语法高亮
- 底部：测试面板——用户粘贴一段输入 JSON，点击"测试"实时预览转换结果，方便调试
- 必填模板标记星号，可选模板（流式）折叠收起

### 渠道管理页面改动

现有的"渠道管理"页面中，渠道的 `provider` 下拉框改为"转换规则"选择器，列出所有已启用的规则。

## 七、Rust 后端架构变更

### 新增模块 `src-tauri/src/rules/`

```
rules/
├── mod.rs          -- ConversionRule 结构体、RuleEngine trait
├── engine.rs       -- JSONata 执行引擎封装
├── registry.rs     -- 规则注册表（内置 + 用户规则统一索引）
└── repository.rs   -- 远程规则仓库拉取逻辑
```

### RuleRegistry（规则注册表）

应用启动时加载所有启用的规则到内存，提供按 slug 查询。规则变更时（CRUD、导入）热更新注册表，无需重启服务。

```rust
pub enum CodecProvider {
    Builtin(ChatFormat),           // 快路径：现有硬编码 Codec
    Jsonata(Arc<ConversionRule>),  // 灵活路径：JSONata 规则
}

pub struct RuleRegistry {
    rules: RwLock<HashMap<String, CodecProvider>>,
}

impl RuleRegistry {
    pub fn get(&self, slug: &str) -> Option<CodecProvider>;
}
```

### proxy.rs 改造

当前 `proxy_chat()` 中通过 `ChatFormat` 枚举获取 Decoder/Encoder，改为通过 `RuleRegistry` 获取 `CodecProvider`，再 match 分发到内置 Codec 或 JSONata 引擎。改动集中在调度层，内置 Codec 的实现完全不动。

### JSONata 引擎选型

评估 `jsonata-rs` crate 的可用性。如果成熟度不足，备选方案是通过 `boa_engine`（Rust 实现的 JS 引擎）运行 JSONata 的 JS 版本，性能略低但功能完整可靠。

## 八、安全性与边界约束

### JSONata 执行沙箱

- 设置表达式执行超时（默认 500ms），防止用户编写的低效表达式阻塞流式转发
- 禁止 JSONata 的 `$eval()` 函数（动态求值），避免注入风险
- 限制表达式输出大小（默认 1MB），防止意外的内存膨胀
- 每次执行在独立上下文中，规则之间无共享状态

### 规则校验

- 保存/导入时做语法校验（JSONata 表达式是否可解析）
- 提供"测试运行"功能：用户提供样例输入 JSON，执行全链路转换（decode → IR → encode），展示每一步的中间结果和最终输出
- 模板输出必须是合法 JSON，运行时如果 JSONata 产出非法 JSON 则返回 `Codec` 错误

### 系统规则保护

- `rule_type=system` 的规则不可编辑、删除、覆盖
- 用户可以"复制"系统规则为自定义副本进行修改
- 应用升级时自动更新系统规则（按 slug 匹配，覆盖模板内容），不影响用户规则

### 向后兼容

- 现有数据库中 `Channel.provider` 存储的旧枚举值（`openai`、`anthropic` 等）在迁移脚本中映射为对应的系统规则 slug
- 现有 API 路径（`/v1/chat/completions` 等）保持不变，行为不变
