# API Gateway 菜单合并与工作流简化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 LLM API 网关的 5 个独立菜单项（Channels、Rules、Model Mappings、Tokens、Request Logs）合并为一个 "API Gateway" 入口（内部 Tab 切换），并简化新用户的配置工作流。

**Architecture:** 创建一个新的 `ApiGateway` 页面组件，内部使用 Tabs 组织现有的 5 个子页面组件。侧边栏从 7 个菜单项精简为 3 个。后端增加"无映射时 passthrough"逻辑和默认 Token 自动生成，使得用户只需创建渠道即可开始使用。

**Tech Stack:** React 19, React Router, shadcn/ui Tabs, Tailwind CSS, Rust/SQLite (后端少量改动)

---

## Task 1: 创建 API Gateway 页面（Tab 容器）

**Files:**
- Create: `src/pages/ApiGateway.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/lib/i18n.tsx`

**Step 1: 创建 ApiGateway 页面组件**

创建 `src/pages/ApiGateway.tsx`，使用 shadcn/ui 的 Tabs 组件包裹现有的 5 个页面组件：

```tsx
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, FileCode2, ArrowRightLeft, KeyRound, ScrollText } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import Channels from "./Channels";
import Rules from "./Rules";
import ModelMappings from "./ModelMappings";
import Tokens from "./Tokens";
import RequestLogs from "./RequestLogs";

const TABS = ["channels", "rules", "model-mappings", "tokens", "request-logs"] as const;
type TabValue = (typeof TABS)[number];

export default function ApiGateway() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.includes(searchParams.get("tab") as TabValue)
    ? (searchParams.get("tab") as TabValue)
    : "channels";
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabValue);
    setSearchParams({ tab: value }, { replace: true });
  };

  const tabItems = [
    { value: "channels", icon: Network, label: t.sidebar.channels },
    { value: "rules", icon: FileCode2, label: t.sidebar.rules },
    { value: "model-mappings", icon: ArrowRightLeft, label: t.sidebar.modelMappings },
    { value: "tokens", icon: KeyRound, label: t.sidebar.tokens },
    { value: "request-logs", icon: ScrollText, label: t.sidebar.requestLogs },
  ];

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
      <TabsList>
        {tabItems.map((item) => (
          <TabsTrigger key={item.value} value={item.value} className="gap-2">
            <item.icon className="h-4 w-4" />
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="channels"><Channels /></TabsContent>
      <TabsContent value="rules"><Rules /></TabsContent>
      <TabsContent value="model-mappings"><ModelMappings /></TabsContent>
      <TabsContent value="tokens"><Tokens /></TabsContent>
      <TabsContent value="request-logs"><RequestLogs /></TabsContent>
    </Tabs>
  );
}
```

**Step 2: 更新路由配置**

修改 `src/App.tsx`：
- 移除 5 个独立路由（`/channels`, `/rules`, `/model-mappings`, `/tokens`, `/request-logs`）
- 新增 `/api-gateway` 路由
- 默认重定向从 `/channels` 改为 `/api-gateway`
- 保留 `/usage-stats` 路由（未在侧边栏，不动）

```tsx
// 移除:
// <Route path="channels" element={<Channels />} />
// <Route path="model-mappings" element={<ModelMappings />} />
// <Route path="tokens" element={<Tokens />} />
// <Route path="request-logs" element={<RequestLogs />} />
// <Route path="rules" element={<Rules />} />

// 新增:
import ApiGateway from "@/pages/ApiGateway";
// ...
<Route index element={<Navigate to="/api-gateway" replace />} />
<Route path="api-gateway" element={<ApiGateway />} />
```

**Step 3: 更新侧边栏导航**

修改 `src/components/layout/Sidebar.tsx` 的 `navItems` 数组：
- 移除 channels, rules, model-mappings, tokens, request-logs 共 5 项
- 新增 1 项 api-gateway

```tsx
// 替换 navItems 为:
const navItems = [
  { to: "/api-gateway", icon: Network, label: t.sidebar.apiGateway },
  { to: "/proxy", icon: Waypoints, label: t.sidebar.proxy },
  { to: "/video-download", icon: Download, label: t.sidebar.videoDownload },
];
```

**Step 4: 添加 i18n 翻译**

修改 `src/lib/i18n.tsx`：

1. 在 Translations 类型的 sidebar 部分新增 `apiGateway: string;`
2. 英文翻译：`apiGateway: "API Gateway"`
3. 中文翻译：`apiGateway: "API 网关"`

**Step 5: 验证**

运行 `pnpm dev`，确认：
- 侧边栏只有 3 个菜单项：API Gateway、Proxy、Video Download
- 点击 API Gateway 进入 Tab 页面
- 5 个 Tab 均可切换，内容正常渲染
- Tab 切换时 URL query param 同步变化
- 刷新页面后 Tab 状态保持

**Step 6: 提交**

```bash
git add src/pages/ApiGateway.tsx src/App.tsx src/components/layout/Sidebar.tsx src/lib/i18n.tsx
git commit -m "feat(ui): consolidate LLM gateway pages into single API Gateway tab view"
```

---

## Task 2: 移除子页面的 PageHeader 避免重复标题

当 Channels、Rules 等组件作为 Tab 内容渲染时，它们自带的 PageHeader（标题 + 副标题）会与 Tab 标签重复。需要让这些组件在 Tab 模式下隐藏 PageHeader。

**Files:**
- Modify: `src/pages/Channels.tsx`
- Modify: `src/pages/Rules.tsx`
- Modify: `src/pages/ModelMappings.tsx`
- Modify: `src/pages/Tokens.tsx`
- Modify: `src/pages/RequestLogs.tsx`
- Modify: `src/pages/ApiGateway.tsx`

**Step 1: 给每个子页面组件添加 `embedded` prop**

在每个子页面组件中：

```tsx
// 例如 Channels.tsx
export default function Channels({ embedded = false }: { embedded?: boolean }) {
  // ...
  return (
    <div className="space-y-6">
      {!embedded && <PageHeader ... />}
      {/* 其余内容不变 */}
    </div>
  );
}
```

对 5 个页面组件都做同样的修改。

**Step 2: ApiGateway 传入 embedded prop**

```tsx
<TabsContent value="channels"><Channels embedded /></TabsContent>
<TabsContent value="rules"><Rules embedded /></TabsContent>
<TabsContent value="model-mappings"><ModelMappings embedded /></TabsContent>
<TabsContent value="tokens"><Tokens embedded /></TabsContent>
<TabsContent value="request-logs"><RequestLogs embedded /></TabsContent>
```

**Step 3: 验证**

确认 Tab 内容区域不再显示重复的标题。

**Step 4: 提交**

```bash
git add src/pages/Channels.tsx src/pages/Rules.tsx src/pages/ModelMappings.tsx src/pages/Tokens.tsx src/pages/RequestLogs.tsx src/pages/ApiGateway.tsx
git commit -m "feat(ui): hide PageHeader in embedded tab mode for gateway sub-pages"
```

---

## Task 3: Model Mapping Passthrough（无映射时直通）

当前逻辑：如果没有为某个 model name 创建 ModelMapping，`select_channel()` 会返回 `NoChannel` 错误。这要求用户必须手动创建每个模型的映射。

优化：当没有找到 ModelMapping 时，fallback 到直接查找所有启用的 Channel（按优先级+权重），使用 `public_name == actual_name`（直通）。

**Files:**
- Modify: `src-tauri/src/routing/balancer.rs`

**Step 1: 修改 `select_channel` 函数**

在 `balancer.rs` 中，当 `model_mappings` 查询返回空结果时，增加 fallback 逻辑：

```rust
// 在 rows.is_empty() 的分支中，不直接返回错误，而是尝试 passthrough:
if rows.is_empty() {
    // Fallback: passthrough mode - find any enabled channel, use model name as-is
    let fallback_rows = sqlx::query_as::<_, ChannelRow>(
        "SELECT id, name, provider, base_url, priority, weight, enabled, key_rotation,
                rate_limit, created_at, updated_at
         FROM channels
         WHERE enabled = 1
         ORDER BY priority ASC"
    )
    .fetch_all(db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if fallback_rows.is_empty() {
        return Err(AppError::NoChannel(model.to_string()));
    }

    // 使用与正常流程相同的优先级+权重选择逻辑
    // actual_name = model (passthrough)
    // 构造 SelectedChannel，mapping 中 actual_name = public_name = model
}
```

具体实现需要根据 `balancer.rs` 中现有的类型和逻辑来适配。关键点：
- Fallback 只在 model_mappings 表无匹配时触发
- 直通模式下 `actual_name = model`（请求中的 model 名原样传递给上游）
- Channel 选择仍遵循优先级 + 权重 + 熔断逻辑
- 需要定义 `ChannelRow` 或复用已有类型来承载不带 mapping 的查询结果

**Step 2: 验证**

启动应用，不创建任何 ModelMapping，直接用一个已有 Channel 发送请求，确认请求能正确路由到该 Channel，model name 原样传递。

**Step 3: 提交**

```bash
git add src-tauri/src/routing/balancer.rs
git commit -m "feat(routing): fallback to passthrough when no model mapping exists"
```

---

## Task 4: 默认 Token 自动生成

首次启动时自动生成一个默认 Token，这样用户不需要手动创建 Token 就能开始使用。

**Files:**
- Modify: `src-tauri/src/db/` (migration 或初始化逻辑)
- Modify: 初始化代码（需要确认具体文件位置）

**Step 1: 确认数据库初始化入口**

查找应用启动时创建数据库连接和运行 migration 的代码位置。

**Step 2: 在初始化后检查并创建默认 Token**

在数据库初始化完成后，检查 tokens 表是否为空。如果为空，插入一个默认 Token：

```rust
// 在数据库初始化后:
let token_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tokens")
    .fetch_one(&pool)
    .await?;

if token_count == 0 {
    let id = uuid::Uuid::new_v4().to_string();
    let key = format!("sk-{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO tokens (id, name, key_value, quota_used, enabled, created_at)
         VALUES (?, ?, ?, 0, 1, datetime('now'))"
    )
    .bind(&id)
    .bind("Default")
    .bind(&key)
    .execute(&pool)
    .await?;
}
```

**Step 3: 验证**

删除数据库文件，重启应用，确认 Tokens tab 中已有一个名为 "Default" 的 Token。

**Step 4: 提交**

```bash
git add src-tauri/src/db/
git commit -m "feat(db): auto-generate default token on first launch"
```

---

## Task 5: 渠道创建时自动关联规则（UI 提示优化）

当前 Channel 的 `provider` 字段已经与内置 ConversionRule 的 slug 对应（如 `openai-chat` → 内置 OpenAI codec）。这意味着规则关联已经是自动的，用户不需要手动配置 Rules。

但 UI 上没有体现这一点，用户不知道创建 Channel 选择 provider 后规则就已经生效了。

**Files:**
- Modify: `src/pages/Channels.tsx`

**Step 1: 在 Channel 创建/编辑对话框中添加提示**

在 provider 选择器下方添加一条信息提示，告知用户选择 provider 后转换规则会自动生效：

```tsx
// 在 provider Select 组件下方添加:
<p className="text-xs text-muted-foreground">
  {t.channels.providerHint}
</p>
```

**Step 2: 添加 i18n 翻译**

修改 `src/lib/i18n.tsx`：
- 英文：`providerHint: "Conversion rules are automatically applied based on the provider."`
- 中文：`providerHint: "转换规则会根据所选服务商自动应用。"`

**Step 3: 验证**

打开 Channel 创建对话框，确认 provider 选择器下方显示提示文字。

**Step 4: 提交**

```bash
git add src/pages/Channels.tsx src/lib/i18n.tsx
git commit -m "feat(ui): add provider conversion hint in channel dialog"
```

---

## 实施顺序

```
Task 1 (创建 API Gateway 页面)
  ↓
Task 2 (移除子页面 PageHeader)
  ↓ (可与 Task 3、4 并行)
Task 3 (Model Mapping Passthrough)  ←── 独立，后端改动
Task 4 (默认 Token 自动生成)       ←── 独立，后端改动
Task 5 (UI 提示优化)               ←── 独立，前端改动
```

Task 1 和 Task 2 有前后依赖关系。Task 3、4、5 互相独立，可并行实施。
