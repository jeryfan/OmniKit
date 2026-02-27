# Route Redesign Design

Date: 2026-02-27

## Background

The original Channel + ModelMapping system does not match the actual use case.
The user needs format conversion between different LLM provider APIs (e.g., app sends
Anthropic format → OmniKit converts to OpenAI format → forwards to upstream → converts
response back). Model name mapping is unnecessary overhead.

## Core Use Case

User has:
- A third-party OpenAI-compatible API
- A third-party Anthropic-compatible API

User's app only speaks Anthropic format. OmniKit should:
1. Expose a virtual endpoint (e.g., `http://localhost:9000/anthropic`)
2. Accept Anthropic-format requests
3. Load-balance across two targets:
   - Target A: convert Anthropic → OpenAI, forward to OpenAI endpoint
   - Target B: passthrough Anthropic → Anthropic, forward to Anthropic endpoint
4. Convert responses back to Anthropic format

## Data Model

### Route

One route = one virtual endpoint + a group of upstream targets for load balancing.

```
Route
├── id: TEXT (UUID)
├── name: TEXT
├── path_prefix: TEXT UNIQUE  -- e.g. "/anthropic", must start with "/"
├── input_format: TEXT        -- "anthropic" | "openai-chat" | "openai-responses" | "gemini"
├── enabled: BOOLEAN
├── created_at: TEXT
└── updated_at: TEXT
```

### RouteTarget

One target = one upstream provider with its own format, base_url, and API keys.

```
RouteTarget
├── id: TEXT (UUID)
├── route_id: TEXT (FK → routes.id, CASCADE DELETE)
├── upstream_format: TEXT     -- "anthropic" | "openai-chat" | "openai-responses" | "gemini"
├── base_url: TEXT            -- e.g. "https://api.openai.com"
├── weight: INTEGER DEFAULT 1 -- for weighted random load balancing
├── enabled: BOOLEAN
├── key_rotation: BOOLEAN     -- true = round-robin keys, false = always first enabled key
└── created_at: TEXT
```

### RouteTargetKey

```
RouteTargetKey
├── id: TEXT (UUID)
├── target_id: TEXT (FK → route_targets.id, CASCADE DELETE)
├── key_value: TEXT
└── enabled: BOOLEAN
```

### Retained Tables

- `tokens` — client authentication (unchanged)
- `request_logs` — request logging (unchanged)
- `conversion_rules` — codec rules (unchanged)

### Removed Tables

- `channels`
- `channel_api_keys`
- `model_mappings`

## Request Flow

```
Client: POST http://localhost:9000/anthropic/v1/messages
                │
                ▼
    Extract prefix → "/anthropic"
    DB lookup: SELECT * FROM routes WHERE path_prefix = "/anthropic" AND enabled = 1
                │
        ┌───────┴────────┐
      Found            Not Found → 404
        │
        ▼
    Authenticate token (Bearer header)
        │
        ▼
    Decode request body using route.input_format decoder → ChatIR
        │
        ▼
    Load balance: weighted random from enabled route_targets
    (circuit breaker filters out failed targets)
        │
        ▼
    Pick API key from selected target:
      key_rotation=true  → round-robin (atomic counter mod len)
      key_rotation=false → first enabled key
        │
        ▼
    Encode ChatIR → target.upstream_format encoder → upstream body
    Build upstream URL from target.base_url + format-specific path
    Apply format-specific auth header
        │
        ▼
    Forward request, stream response
        │
        ▼
    Decode upstream response → ChatIR
    Encode ChatIR → route.input_format encoder → client response
        │
        ▼
    Return to client
```

### Unrecognized Paths (Passthrough)

For paths that don't map to a known codec endpoint (e.g., `/anthropic/v1/models`):
- Strip the route prefix: `/anthropic/v1/models` → `/v1/models`
- Forward as-is to selected target's `base_url + /v1/models`
- No format conversion

## Routing: Prefix Matching

- All requests are handled by a single wildcard handler `/*path`
- Extract first path segment as prefix candidate (e.g., `/anthropic` from `/anthropic/v1/messages`)
- Look up in `routes` table by `path_prefix`
- No match → fall through to generic proxy (existing behavior) or 404

## Load Balancing

- Weighted random selection across all `enabled = true` targets of the matched route
- Circuit breaker: targets with open circuit are excluded from selection
- If all targets are unavailable → 503 error

## Key Selection

- `key_rotation = true`: maintain a per-target atomic counter in memory, increment on each use, select `counter % len(enabled_keys)`
- `key_rotation = false`: always select the first `enabled = true` key

## UI Design

### ApiGateway Tabs

| Tab | Status |
|-----|--------|
| 路由 (Routes) | New |
| 规则 (Rules) | Keep |
| Token | Keep |
| 请求日志 (Request Logs) | Keep |
| ~~渠道~~ | Removed |
| ~~模型映射~~ | Removed |

### Route List Page

Columns: Name, Path Prefix, Input Format, Target Count, Status, Actions (Edit / Delete)

### Route Dialog (New / Edit) — Everything in One Place

```
┌─────────────────────────────────────┐
│  新建路由                            │
│                                     │
│  名称: [________________]           │
│  路径前缀: [/anthropic  ]           │
│  输入格式: [Anthropic  ▼]           │
│  启用: ●                            │
│                                     │
│  上游目标                   [+ 添加] │
│  ┌─────────────────────────────┐   │
│  │ 格式 [OpenAI ▼]  启用 ●     │   │
│  │ Base URL [________________] │   │
│  │ 权重 [1]  轮询Key ●         │   │
│  │ API Keys                    │   │
│  │ [sk-xxx              ] [×]  │   │
│  │ [sk-yyy              ] [×]  │   │
│  │ [+ 添加Key]                 │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ 格式 [Anthropic ▼]  启用 ●  │   │
│  │ ...                         │   │
│  └─────────────────────────────┘   │
│                                     │
│           [取消]  [保存]            │
└─────────────────────────────────────┘
```

- Each target is a card with inline key management
- No navigation to other pages required

## Backend File Changes

| File | Change |
|------|--------|
| `src-tauri/migrations/` | New migration: drop old tables, create routes/route_targets/route_target_keys |
| `src-tauri/src/db/models.rs` | Remove Channel/ChannelApiKey/ModelMapping, add Route/RouteTarget/RouteTargetKey |
| `src-tauri/src/routing/balancer.rs` | Rewrite: prefix lookup → weighted random target → key selection |
| `src-tauri/src/server/router.rs` | Replace fixed routes with `/*path` wildcard handler |
| `src-tauri/src/server/proxy.rs` | Rewrite: input_format from route config, not hardcoded from path |
| `src-tauri/src/commands/mod.rs` | Remove channel/mapping commands, add route CRUD |
| `src-tauri/src/commands/routes.rs` | New file: route CRUD Tauri commands |
| `src/pages/ApiGateway.tsx` | Update tabs |
| `src/pages/Routes.tsx` | New page: route list + dialog |
| `src/lib/tauri.ts` | Add route API bindings |
