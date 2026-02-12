# Phase 3: Management Frontend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the management frontend with full CRUD for channels, model mappings, tokens, request logs, dashboard overview, and settings — all communicating via Tauri IPC to the Rust backend.

**Architecture:** Tauri IPC commands in Rust expose CRUD operations on SQLite. The React frontend calls these via `@tauri-apps/api/core invoke()`. Each page uses shadcn/ui components (Table, Dialog, Form, etc.) with Tailwind CSS. State management is local (useState/useEffect) — no global store needed.

**Tech Stack:** React 19, TypeScript, shadcn/ui, Tailwind CSS v4, Recharts, Tauri IPC, Rust/sqlx

**Pre-requisites:** Phase 1 (skeleton) + Phase 2 (conversion engine) complete. 7 skeleton pages exist. 4 shadcn components installed (button, scroll-area, separator, tooltip).

---

### Task 1: Tauri IPC CRUD Commands

**Files:**
- Create: `src-tauri/src/commands/channels.rs`
- Create: `src-tauri/src/commands/tokens.rs`
- Create: `src-tauri/src/commands/model_mappings.rs`
- Create: `src-tauri/src/commands/request_logs.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (register new commands)

**Context:** Each CRUD module follows the same pattern — list, get, create, update, delete operations using sqlx queries against SQLite. All commands use `State<'_, AppState>` to access the DB pool. IDs use `uuid::Uuid::new_v4()`.

**Step 1: Create `src-tauri/src/commands/channels.rs`**

Commands to implement:
```rust
#[tauri::command]
pub async fn list_channels(state: State<'_, AppState>) -> Result<Vec<Channel>, String>
// SELECT * FROM channels ORDER BY priority ASC, name ASC

#[tauri::command]
pub async fn create_channel(state: State<'_, AppState>, name: String, provider: String, base_url: String, priority: i32, weight: i32) -> Result<Channel, String>
// INSERT with uuid::Uuid::new_v4(), enabled=true, key_rotation=false

#[tauri::command]
pub async fn update_channel(state: State<'_, AppState>, id: String, name: String, provider: String, base_url: String, priority: i32, weight: i32, enabled: bool, key_rotation: bool) -> Result<(), String>
// UPDATE channels SET ... WHERE id = ?

#[tauri::command]
pub async fn delete_channel(state: State<'_, AppState>, id: String) -> Result<(), String>
// DELETE FROM channels WHERE id = ?

#[tauri::command]
pub async fn list_channel_api_keys(state: State<'_, AppState>, channel_id: String) -> Result<Vec<ChannelApiKey>, String>
// SELECT * FROM channel_api_keys WHERE channel_id = ?

#[tauri::command]
pub async fn add_channel_api_key(state: State<'_, AppState>, channel_id: String, key_value: String) -> Result<ChannelApiKey, String>
// INSERT INTO channel_api_keys

#[tauri::command]
pub async fn delete_channel_api_key(state: State<'_, AppState>, id: String) -> Result<(), String>
// DELETE FROM channel_api_keys WHERE id = ?

#[tauri::command]
pub async fn toggle_channel_api_key(state: State<'_, AppState>, id: String, enabled: bool) -> Result<(), String>
// UPDATE channel_api_keys SET enabled = ? WHERE id = ?

#[tauri::command]
pub async fn test_channel(state: State<'_, AppState>, id: String) -> Result<serde_json::Value, String>
// Fetch one API key, send a test request to base_url/health or similar, return result
```

Error handling pattern — map sqlx errors to String:
```rust
.map_err(|e| e.to_string())?;
```

**Step 2: Create `src-tauri/src/commands/tokens.rs`**

Commands:
```rust
list_tokens -> Vec<Token>
create_token(name: Option<String>, quota_limit: Option<i64>, expires_at: Option<String>, allowed_models: Option<String>) -> Token
// Generate key_value with format "sk-" + uuid
update_token(id, name, quota_limit, expires_at, allowed_models, enabled) -> ()
delete_token(id) -> ()
reset_token_quota(id) -> ()  // SET quota_used = 0
```

**Step 3: Create `src-tauri/src/commands/model_mappings.rs`**

Commands:
```rust
list_model_mappings -> Vec<ModelMapping>
create_model_mapping(public_name, channel_id, actual_name, modality) -> ModelMapping
update_model_mapping(id, public_name, channel_id, actual_name, modality) -> ()
delete_model_mapping(id) -> ()
```

**Step 4: Create `src-tauri/src/commands/request_logs.rs`**

Commands:
```rust
list_request_logs(limit: Option<i64>, offset: Option<i64>, model: Option<String>) -> Vec<RequestLog>
// SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ? OFFSET ?
// Optional WHERE model = ? filter
get_request_log(id: String) -> Option<RequestLog>
clear_request_logs() -> ()
// DELETE FROM request_logs
get_usage_stats(days: Option<i32>) -> serde_json::Value
// Aggregate query: COUNT, SUM(prompt_tokens), SUM(completion_tokens) grouped by date, model, channel
```

**Step 5: Update `src-tauri/src/commands/mod.rs`**

```rust
pub mod config;
pub mod channels;
pub mod tokens;
pub mod model_mappings;
pub mod request_logs;
```

**Step 6: Register all commands in `src-tauri/src/lib.rs`**

Add all new commands to `tauri::generate_handler![]`:
```rust
.invoke_handler(tauri::generate_handler![
    commands::config::get_config,
    commands::config::get_server_status,
    commands::channels::list_channels,
    commands::channels::create_channel,
    commands::channels::update_channel,
    commands::channels::delete_channel,
    commands::channels::list_channel_api_keys,
    commands::channels::add_channel_api_key,
    commands::channels::delete_channel_api_key,
    commands::channels::toggle_channel_api_key,
    commands::channels::test_channel,
    commands::tokens::list_tokens,
    commands::tokens::create_token,
    commands::tokens::update_token,
    commands::tokens::delete_token,
    commands::tokens::reset_token_quota,
    commands::model_mappings::list_model_mappings,
    commands::model_mappings::create_model_mapping,
    commands::model_mappings::update_model_mapping,
    commands::model_mappings::delete_model_mapping,
    commands::request_logs::list_request_logs,
    commands::request_logs::get_request_log,
    commands::request_logs::clear_request_logs,
    commands::request_logs::get_usage_stats,
])
```

**Step 7: Verify compilation**

```bash
cd src-tauri && cargo check
```

---

### Task 2: Frontend TypeScript IPC Layer

**Files:**
- Rewrite: `src/lib/tauri.ts`

**Context:** Extend the IPC layer with TypeScript interfaces matching all Rust models and functions wrapping `invoke()` for each command.

**Step 1: Rewrite `src/lib/tauri.ts`**

Add interfaces:
```typescript
export interface Channel {
  id: string; name: string; provider: string; base_url: string;
  priority: number; weight: number; enabled: boolean; key_rotation: boolean;
  rate_limit: string | null; created_at: string; updated_at: string;
}

export interface ChannelApiKey {
  id: string; channel_id: string; key_value: string;
  enabled: boolean; last_used: string | null;
}

export interface ModelMapping {
  id: string; public_name: string; channel_id: string;
  actual_name: string; modality: string;
}

export interface Token {
  id: string; name: string | null; key_value: string;
  quota_limit: number | null; quota_used: number;
  expires_at: string | null; allowed_models: string | null;
  enabled: boolean; created_at: string;
}

export interface RequestLog {
  id: string; token_id: string | null; channel_id: string | null;
  model: string | null; modality: string | null;
  input_format: string | null; output_format: string | null;
  status: number | null; latency_ms: number | null;
  prompt_tokens: number | null; completion_tokens: number | null;
  request_body: string | null; response_body: string | null;
  created_at: string;
}
```

Add wrapper functions for every command (e.g.):
```typescript
export async function listChannels(): Promise<Channel[]> {
  return invoke("list_channels");
}
export async function createChannel(data: { name: string; provider: string; base_url: string; priority: number; weight: number }): Promise<Channel> {
  return invoke("create_channel", data);
}
// ... etc for all 20+ commands
```

---

### Task 3: Install shadcn/ui Components

**Context:** The pages need additional UI components. Install them via the shadcn CLI.

**Step 1: Install components**

```bash
cd /Users/fanjunjie/Documents/repositories/personal/oneapi
npx shadcn@latest add table dialog input label select switch badge card textarea dropdown-menu alert-dialog tabs
```

This installs ~13 components needed by the management pages. If the CLI prompts, accept defaults.

**Step 2: Verify all components exist in `src/components/ui/`**

---

### Task 4: Channel Management Page

**Files:**
- Rewrite: `src/pages/Channels.tsx`

**Context:** Full CRUD page for channels with:
- Table listing all channels (name, provider, base_url, priority, weight, enabled status)
- "Add Channel" button → Dialog with form
- Edit button per row → Dialog with form
- Delete button per row → Confirmation dialog
- Toggle enabled/disabled
- Expand row to manage API keys for that channel
- Test connectivity button

**Implementation guidance:**

The page should:
1. `useEffect` → call `listChannels()` on mount, store in state
2. Table with columns: Name, Provider, Base URL, Priority, Weight, Status, Actions
3. Status column: Badge showing enabled/disabled
4. Actions column: Edit, Delete, Test, Manage Keys buttons
5. Add/Edit Dialog: Form with fields for name, provider (select: openai/anthropic/gemini/moonshot), base_url, priority, weight
6. Delete: AlertDialog confirmation
7. API Keys sub-section: When "Manage Keys" clicked, show a nested panel with:
   - List of keys (masked: show only last 4 chars)
   - Add key input + button
   - Delete key button per key
   - Toggle key enabled/disabled

Provider select options: `openai`, `anthropic`, `gemini`, `moonshot`

---

### Task 5: Model Mappings Page

**Files:**
- Rewrite: `src/pages/ModelMappings.tsx`

**Context:** CRUD for model mappings:
- Table: Public Name, Channel (show channel name), Actual Name, Modality, Actions
- Add/Edit Dialog with form
- Channel selection needs a dropdown populated from `listChannels()`
- Delete with confirmation

---

### Task 6: Token Management Page

**Files:**
- Rewrite: `src/pages/Tokens.tsx`

**Context:** Manage external API tokens:
- Table: Name, Key (masked), Quota (used/limit), Expires At, Allowed Models, Status, Actions
- "Generate Token" button → Dialog (name, quota_limit, expires_at, allowed_models)
- Show full key value once on creation (copyable), masked afterwards
- Edit button → Dialog
- Delete with confirmation
- Reset quota button
- Badge for status (active/expired/disabled)

---

### Task 7: Request Logs Page

**Files:**
- Rewrite: `src/pages/RequestLogs.tsx`

**Context:** View request history:
- Table: Time, Model, Input Format, Output Format, Status, Latency, Tokens, Actions
- Click row to expand/view details (request_body, response_body in JSON viewer)
- Filter by model (text input or select)
- Pagination (limit/offset based)
- "Clear Logs" button with confirmation
- Status column: colored badge (green=2xx, red=4xx/5xx)
- Latency: formatted as "123ms"
- Tokens: "prompt/completion"

---

### Task 8: Dashboard Page

**Files:**
- Rewrite: `src/pages/Dashboard.tsx`

**Context:** Overview dashboard with:
- Top row: 4 stat cards (Total Requests, Active Channels, Active Tokens, Total Models)
- Cards use data from list commands (count results)
- Server status card (port, version, status)
- Request trend chart (last 7 days) using Recharts BarChart or LineChart
- Data from `get_usage_stats(days: 7)`

Recharts is already installed. Use `BarChart` with `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`.

---

### Task 9: Settings Page

**Files:**
- Rewrite: `src/pages/Settings.tsx`
- Modify: `src-tauri/src/commands/config.rs` (add update_config command)
- Modify: `src-tauri/src/config.rs` (add persistence)

**Context:** System settings:
- Server port display (read-only for now — requires restart)
- Log retention days (editable)
- Theme toggle (already works via ThemeProvider)
- Version info display
- Data export button (export SQLite DB)

For config persistence, add a `settings` table or store in a JSON file. Keep it simple — for now, just display current config and the theme toggle.

---

## Summary

After completing all 9 tasks:

| Component | Status |
|-----------|--------|
| Tauri IPC Commands | 24 commands across 4 modules |
| TypeScript IPC Layer | Full type-safe wrappers |
| Channel Management | Full CRUD + API key management + test |
| Model Mappings | Full CRUD with channel selection |
| Token Management | Generate/revoke + quotas + masking |
| Request Logs | List + filter + pagination + details |
| Dashboard | Stat cards + request chart |
| Settings | Config display + theme |

**Next:** Phase 4 — Statistics dashboard, request logging middleware, data export/import, polish.
