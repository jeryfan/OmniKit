# Generic Proxy (Passthrough Forwarding) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a generic HTTP proxy feature that forwards any request under a configurable path prefix (e.g. `/proxy`) to a target base URL, with request/response logging for debugging.

**Architecture:** A new `proxy_rules` table stores forwarding rules (path_prefix → target_base_url). A catch-all Axum fallback handler matches unhandled paths against registered rules, forwards the request transparently (preserving method, headers, body, query string), and logs everything to a `proxy_logs` table. A new frontend page manages rules and views logs.

**Tech Stack:** Rust/Axum (backend), SQLite/sqlx (storage), React/TypeScript/shadcn (frontend)

---

### Task 1: Database Migration

**Files:**
- Create: `src-tauri/migrations/004_proxy.sql`

**Step 1: Write the migration SQL**

```sql
-- Proxy forwarding rules
CREATE TABLE IF NOT EXISTS proxy_rules (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path_prefix TEXT NOT NULL UNIQUE,
    target_base_url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Proxy request/response logs
CREATE TABLE IF NOT EXISTS proxy_logs (
    id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL REFERENCES proxy_rules(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    request_headers TEXT,
    request_body TEXT,
    status INTEGER,
    response_headers TEXT,
    response_body TEXT,
    latency_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proxy_logs_rule_id ON proxy_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_proxy_logs_created_at ON proxy_logs(created_at);
```

**Step 2: Verify migration compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles (sqlx will auto-run migration on startup)

---

### Task 2: Rust Data Models

**Files:**
- Modify: `src-tauri/src/db/models.rs` (append new structs)

**Step 1: Add ProxyRule and ProxyLog models**

Append to `src-tauri/src/db/models.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProxyRule {
    pub id: String,
    pub name: String,
    pub path_prefix: String,
    pub target_base_url: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProxyLog {
    pub id: String,
    pub rule_id: String,
    pub method: String,
    pub url: String,
    pub request_headers: Option<String>,
    pub request_body: Option<String>,
    pub status: Option<i32>,
    pub response_headers: Option<String>,
    pub response_body: Option<String>,
    pub latency_ms: Option<i64>,
    pub created_at: String,
}
```

**Step 2: Verify**

Run: `cd src-tauri && cargo check`

---

### Task 3: Generic Proxy Handler

**Files:**
- Create: `src-tauri/src/server/generic_proxy.rs`
- Modify: `src-tauri/src/server/mod.rs` (add `pub mod generic_proxy;`)
- Modify: `src-tauri/src/server/router.rs` (add fallback handler)

**Step 1: Create the generic proxy handler**

Create `src-tauri/src/server/generic_proxy.rs`:

```rust
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use sqlx::SqlitePool;

use crate::db::models::ProxyRule;
use crate::error::AppError;

/// Shared state for generic proxy (reuses the same db pool and http client).
#[derive(Clone)]
pub struct GenericProxyState {
    pub db: SqlitePool,
    pub http_client: reqwest::Client,
}

/// Headers that should NOT be forwarded to upstream.
const HOP_BY_HOP: &[&str] = &[
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
];

/// Fallback handler: match request path against proxy_rules and forward.
pub async fn handle_generic_proxy(
    State(state): State<GenericProxyState>,
    req: Request,
) -> Result<Response, AppError> {
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| q.to_string());

    // Find matching rule by longest prefix match
    let rules: Vec<ProxyRule> = sqlx::query_as(
        "SELECT * FROM proxy_rules WHERE enabled = 1 ORDER BY LENGTH(path_prefix) DESC",
    )
    .fetch_all(&state.db)
    .await?;

    let matched = rules.iter().find(|r| {
        let prefix = r.path_prefix.trim_end_matches('/');
        path == prefix || path.starts_with(&format!("{}/", prefix))
    });

    let rule = match matched {
        Some(r) => r.clone(),
        None => {
            return Ok(Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("Not Found"))
                .unwrap());
        }
    };

    let start = std::time::Instant::now();
    let method = req.method().clone();

    // Strip the path_prefix to get the remaining path
    let prefix = rule.path_prefix.trim_end_matches('/');
    let remaining = path.strip_prefix(prefix).unwrap_or("");
    let remaining = if remaining.is_empty() { "/" } else { remaining };

    // Build target URL
    let base = rule.target_base_url.trim_end_matches('/');
    let target_url = match &query {
        Some(q) => format!("{}{}?{}", base, remaining, q),
        None => format!("{}{}", base, remaining),
    };

    // Extract request headers and body before consuming the request
    let (parts, body) = req.into_parts();
    let req_headers = parts.headers;
    let body_bytes = axum::body::to_bytes(body, 10 * 1024 * 1024)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read body: {}", e)))?;

    // Serialize request headers for logging
    let req_headers_json = serialize_headers(&req_headers);
    let req_body_str = if body_bytes.is_empty() {
        None
    } else {
        Some(String::from_utf8_lossy(&body_bytes).to_string())
    };

    // Build upstream request
    let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .unwrap_or(reqwest::Method::GET);

    let mut upstream_req = state.http_client.request(reqwest_method, &target_url);

    // Forward headers (skip hop-by-hop)
    for (name, value) in req_headers.iter() {
        let name_lower = name.as_str().to_lowercase();
        if HOP_BY_HOP.contains(&name_lower.as_str()) {
            continue;
        }
        if let Ok(v) = value.to_str() {
            upstream_req = upstream_req.header(name.as_str(), v);
        }
    }

    // Attach body for methods that support it
    if !body_bytes.is_empty() {
        upstream_req = upstream_req.body(body_bytes.clone());
    }

    // Send upstream request
    let upstream_resp = upstream_req.send().await;

    match upstream_resp {
        Ok(resp) => {
            let status = resp.status();
            let resp_headers = resp.headers().clone();
            let resp_headers_json = serialize_reqwest_headers(&resp_headers);

            // Check if this is a streaming response (SSE or chunked)
            let content_type = resp_headers
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            let is_streaming = content_type.contains("text/event-stream")
                || content_type.contains("application/x-ndjson");

            if is_streaming {
                // Stream response: forward chunks without buffering
                let latency = start.elapsed().as_millis() as i64;
                let log_id = uuid::Uuid::new_v4().to_string();
                let db = state.db.clone();
                let rule_id = rule.id.clone();

                // Log request (response body will say "streaming")
                log_proxy_request(
                    &db,
                    &log_id,
                    &rule_id,
                    method.as_str(),
                    &target_url,
                    req_headers_json.as_deref(),
                    req_body_str.as_deref(),
                    Some(status.as_u16() as i32),
                    None,
                    None,
                    latency,
                )
                .await;

                // Build streaming response
                let byte_stream = resp.bytes_stream();
                let stream_body = Body::from_stream(byte_stream);

                let mut response = Response::builder().status(status);
                // Forward response headers
                for (name, value) in resp_headers.iter() {
                    let name_lower = name.as_str().to_lowercase();
                    if HOP_BY_HOP.contains(&name_lower.as_str()) {
                        continue;
                    }
                    if let (Ok(hn), Ok(hv)) = (
                        HeaderName::from_bytes(name.as_str().as_bytes()),
                        HeaderValue::from_bytes(value.as_bytes()),
                    ) {
                        response = response.header(hn, hv);
                    }
                }

                Ok(response.body(stream_body).unwrap())
            } else {
                // Non-streaming: buffer full response
                let resp_body_bytes = resp.bytes().await.unwrap_or_default();
                let latency = start.elapsed().as_millis() as i64;

                let resp_body_str = if resp_body_bytes.is_empty() {
                    None
                } else {
                    Some(String::from_utf8_lossy(&resp_body_bytes).to_string())
                };

                // Log
                let log_id = uuid::Uuid::new_v4().to_string();
                log_proxy_request(
                    &state.db,
                    &log_id,
                    &rule.id,
                    method.as_str(),
                    &target_url,
                    req_headers_json.as_deref(),
                    req_body_str.as_deref(),
                    Some(status.as_u16() as i32),
                    resp_headers_json.as_deref(),
                    resp_body_str.as_deref(),
                    latency,
                )
                .await;

                // Build response
                let mut response = Response::builder().status(status);
                for (name, value) in resp_headers.iter() {
                    let name_lower = name.as_str().to_lowercase();
                    if HOP_BY_HOP.contains(&name_lower.as_str()) {
                        continue;
                    }
                    if let (Ok(hn), Ok(hv)) = (
                        HeaderName::from_bytes(name.as_str().as_bytes()),
                        HeaderValue::from_bytes(value.as_bytes()),
                    ) {
                        response = response.header(hn, hv);
                    }
                }

                Ok(response.body(Body::from(resp_body_bytes)).unwrap())
            }
        }
        Err(e) => {
            let latency = start.elapsed().as_millis() as i64;
            let log_id = uuid::Uuid::new_v4().to_string();
            log_proxy_request(
                &state.db,
                &log_id,
                &rule.id,
                method.as_str(),
                &target_url,
                req_headers_json.as_deref(),
                req_body_str.as_deref(),
                None,
                None,
                Some(&e.to_string()),
                latency,
            )
            .await;
            Err(AppError::HttpClient(e))
        }
    }
}

fn serialize_headers(headers: &HeaderMap) -> Option<String> {
    let mut map = serde_json::Map::new();
    for (name, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            map.insert(name.as_str().to_string(), serde_json::Value::String(v.to_string()));
        }
    }
    if map.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(map).to_string())
    }
}

fn serialize_reqwest_headers(headers: &reqwest::header::HeaderMap) -> Option<String> {
    let mut map = serde_json::Map::new();
    for (name, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            map.insert(name.as_str().to_string(), serde_json::Value::String(v.to_string()));
        }
    }
    if map.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(map).to_string())
    }
}

#[allow(clippy::too_many_arguments)]
async fn log_proxy_request(
    db: &SqlitePool,
    id: &str,
    rule_id: &str,
    method: &str,
    url: &str,
    request_headers: Option<&str>,
    request_body: Option<&str>,
    status: Option<i32>,
    response_headers: Option<&str>,
    response_body: Option<&str>,
    latency_ms: i64,
) {
    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "INSERT INTO proxy_logs (id, rule_id, method, url, request_headers, request_body, status, response_headers, response_body, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(id)
    .bind(rule_id)
    .bind(method)
    .bind(url)
    .bind(request_headers)
    .bind(request_body)
    .bind(status)
    .bind(response_headers)
    .bind(response_body)
    .bind(latency_ms)
    .bind(&now)
    .execute(db)
    .await;

    if let Err(e) = result {
        log::error!("Failed to log proxy request: {}", e);
    }
}
```

**Step 2: Register module and fallback route**

In `src-tauri/src/server/mod.rs`, add `pub mod generic_proxy;`.

In `src-tauri/src/server/router.rs`, modify `create_router`:

```rust
use super::generic_proxy::{self, GenericProxyState};

pub fn create_router(pool: SqlitePool) -> Router {
    let http_client = reqwest::Client::new();
    let circuit = Arc::new(CircuitBreaker::new(5, 60));

    let proxy_state = ProxyState {
        db: pool.clone(),
        http_client: http_client.clone(),
        circuit,
    };

    let generic_state = GenericProxyState {
        db: pool,
        http_client,
    };

    Router::new()
        .route("/health", get(health_check))
        .route("/v1/models", get(list_models))
        .route("/v1/chat/completions", post(handle_openai_chat))
        .route("/v1/responses", post(handle_openai_responses))
        .route("/v1/messages", post(handle_anthropic))
        .layer(CorsLayer::permissive())
        .with_state(proxy_state)
        .fallback(
            axum::routing::any(generic_proxy::handle_generic_proxy)
                .with_state(generic_state),
        )
}
```

Note: the `pool` needs to be cloned before being moved into `proxy_state`, and `http_client` also cloned. Adjust the existing code so `pool` and `http_client` are cloned.

**Step 3: Verify**

Run: `cd src-tauri && cargo check`

---

### Task 4: Tauri IPC Commands for Proxy Rules & Logs

**Files:**
- Create: `src-tauri/src/commands/proxy.rs`
- Modify: `src-tauri/src/commands/mod.rs` (add `pub mod proxy;`)
- Modify: `src-tauri/src/lib.rs` (register commands)

**Step 1: Create proxy commands**

Create `src-tauri/src/commands/proxy.rs`:

```rust
use crate::db::models::{ProxyLog, ProxyRule};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_proxy_rules(state: State<'_, AppState>) -> Result<Vec<ProxyRule>, String> {
    sqlx::query_as::<_, ProxyRule>("SELECT * FROM proxy_rules ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_proxy_rule(
    state: State<'_, AppState>,
    name: String,
    path_prefix: String,
    target_base_url: String,
) -> Result<ProxyRule, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Normalize: ensure path_prefix starts with /
    let path_prefix = if path_prefix.starts_with('/') {
        path_prefix
    } else {
        format!("/{}", path_prefix)
    };

    sqlx::query(
        "INSERT INTO proxy_rules (id, name, path_prefix, target_base_url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)"
    )
    .bind(&id).bind(&name).bind(&path_prefix).bind(&target_base_url)
    .bind(&now).bind(&now)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, ProxyRule>("SELECT * FROM proxy_rules WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_proxy_rule(
    state: State<'_, AppState>,
    id: String,
    name: String,
    path_prefix: String,
    target_base_url: String,
    enabled: bool,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();

    let path_prefix = if path_prefix.starts_with('/') {
        path_prefix
    } else {
        format!("/{}", path_prefix)
    };

    sqlx::query(
        "UPDATE proxy_rules SET name = ?, path_prefix = ?, target_base_url = ?, enabled = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&name).bind(&path_prefix).bind(&target_base_url)
    .bind(enabled).bind(&now).bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_proxy_rule(state: State<'_, AppState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM proxy_rules WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_proxy_logs(
    state: State<'_, AppState>,
    rule_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ProxyLog>, String> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    if let Some(rule_id) = rule_id {
        sqlx::query_as::<_, ProxyLog>(
            "SELECT * FROM proxy_logs WHERE rule_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(&rule_id).bind(limit).bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
    } else {
        sqlx::query_as::<_, ProxyLog>(
            "SELECT * FROM proxy_logs ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(limit).bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn get_proxy_log(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<ProxyLog>, String> {
    sqlx::query_as::<_, ProxyLog>("SELECT * FROM proxy_logs WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_proxy_logs(
    state: State<'_, AppState>,
    rule_id: Option<String>,
) -> Result<(), String> {
    if let Some(rule_id) = rule_id {
        sqlx::query("DELETE FROM proxy_logs WHERE rule_id = ?")
            .bind(&rule_id)
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        sqlx::query("DELETE FROM proxy_logs")
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

**Step 2: Register module and commands**

In `src-tauri/src/commands/mod.rs` add: `pub mod proxy;`

In `src-tauri/src/lib.rs`, add to `invoke_handler`:
```rust
commands::proxy::list_proxy_rules,
commands::proxy::create_proxy_rule,
commands::proxy::update_proxy_rule,
commands::proxy::delete_proxy_rule,
commands::proxy::list_proxy_logs,
commands::proxy::get_proxy_log,
commands::proxy::clear_proxy_logs,
```

**Step 3: Verify**

Run: `cd src-tauri && cargo check`

---

### Task 5: Frontend — TypeScript Types & Tauri IPC

**Files:**
- Modify: `src/lib/tauri.ts` (append types and functions)

**Step 1: Add types and IPC wrappers**

Append to `src/lib/tauri.ts`:

```typescript
// === Proxy Rule types ===

export interface ProxyRule {
  id: string;
  name: string;
  path_prefix: string;
  target_base_url: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProxyLog {
  id: string;
  rule_id: string;
  method: string;
  url: string;
  request_headers: string | null;
  request_body: string | null;
  status: number | null;
  response_headers: string | null;
  response_body: string | null;
  latency_ms: number | null;
  created_at: string;
}

// === Proxy Rule commands ===

export async function listProxyRules(): Promise<ProxyRule[]> {
  return invoke<ProxyRule[]>("list_proxy_rules");
}

export async function createProxyRule(data: {
  name: string;
  path_prefix: string;
  target_base_url: string;
}): Promise<ProxyRule> {
  return invoke<ProxyRule>("create_proxy_rule", {
    name: data.name,
    pathPrefix: data.path_prefix,
    targetBaseUrl: data.target_base_url,
  });
}

export async function updateProxyRule(data: {
  id: string;
  name: string;
  path_prefix: string;
  target_base_url: string;
  enabled: boolean;
}): Promise<void> {
  return invoke<void>("update_proxy_rule", {
    id: data.id,
    name: data.name,
    pathPrefix: data.path_prefix,
    targetBaseUrl: data.target_base_url,
    enabled: data.enabled,
  });
}

export async function deleteProxyRule(id: string): Promise<void> {
  return invoke<void>("delete_proxy_rule", { id });
}

// === Proxy Log commands ===

export async function listProxyLogs(params?: {
  rule_id?: string;
  limit?: number;
  offset?: number;
}): Promise<ProxyLog[]> {
  return invoke<ProxyLog[]>("list_proxy_logs", {
    ruleId: params?.rule_id,
    limit: params?.limit,
    offset: params?.offset,
  });
}

export async function getProxyLog(id: string): Promise<ProxyLog | null> {
  return invoke<ProxyLog | null>("get_proxy_log", { id });
}

export async function clearProxyLogs(ruleId?: string): Promise<void> {
  return invoke<void>("clear_proxy_logs", { ruleId });
}
```

---

### Task 6: Frontend — i18n Translations

**Files:**
- Modify: `src/lib/i18n.tsx`

**Step 1: Add type definitions**

Add to the `Translations` interface (after `settings`):

```typescript
proxy: {
    title: string;
    subtitle: string;
    rules: string;
    logs: string;
    addRule: string;
    editRule: string;
    noRules: string;
    noRulesHint: string;
    pathPrefix: string;
    targetBaseUrl: string;
    pathPrefixPlaceholder: string;
    targetBaseUrlPlaceholder: string;
    namePlaceholder: string;
    deleteRule: string;
    deleteRuleConfirm: (name: string) => string;
    createRule: string;
    updateRule: string;
    saveChanges: string;
    usage: string;
    // logs
    logsTitle: string;
    logsSubtitle: string;
    clearLogs: string;
    clearLogsTitle: string;
    clearLogsDesc: string;
    clearAll: string;
    noLogs: string;
    noLogsHint: string;
    time: string;
    method: string;
    url: string;
    latency: string;
    requestHeaders: string;
    requestBody: string;
    responseHeaders: string;
    responseBody: string;
    viewDetails: string;
    detailTitle: string;
    allRules: string;
    filterByRule: string;
    streaming: string;
    autoRefresh: string;
  };
```

**Step 2: Add English translations**

Add `proxy` key to the `en` object:

```typescript
proxy: {
    title: "Proxy",
    subtitle: "Generic HTTP proxy for debugging and request inspection.",
    rules: "Rules",
    logs: "Logs",
    addRule: "Add Rule",
    editRule: "Edit Rule",
    noRules: "No proxy rules configured",
    noRulesHint: "Create a proxy rule to start forwarding requests.",
    pathPrefix: "Path Prefix",
    targetBaseUrl: "Target Base URL",
    pathPrefixPlaceholder: "e.g. /proxy",
    targetBaseUrlPlaceholder: "e.g. https://api.example.com",
    namePlaceholder: "e.g. My API Proxy",
    deleteRule: "Delete Rule",
    deleteRuleConfirm: (name: string) => `Are you sure you want to delete "${name}"? All associated logs will also be removed.`,
    createRule: "Create Rule",
    updateRule: "Update Rule",
    saveChanges: "Save Changes",
    usage: "Usage",
    logsTitle: "Proxy Logs",
    logsSubtitle: "Inspect proxied request and response details.",
    clearLogs: "Clear Logs",
    clearLogsTitle: "Clear proxy logs?",
    clearLogsDesc: "This action cannot be undone. All proxy log entries will be permanently deleted.",
    clearAll: "Clear All",
    noLogs: "No proxy logs found",
    noLogsHint: "Logs will appear here once proxy rules handle requests.",
    time: "Time",
    method: "Method",
    url: "URL",
    latency: "Latency",
    requestHeaders: "Request Headers",
    requestBody: "Request Body",
    responseHeaders: "Response Headers",
    responseBody: "Response Body",
    viewDetails: "View Details",
    detailTitle: "Proxy Log Details",
    allRules: "All Rules",
    filterByRule: "Filter by rule",
    streaming: "Streaming",
    autoRefresh: "Auto Refresh",
  },
```

**Step 3: Add Chinese translations**

Add `proxy` key to the `zh` object:

```typescript
proxy: {
    title: "代理",
    subtitle: "通用 HTTP 代理，用于调试和请求检查。",
    rules: "规则",
    logs: "日志",
    addRule: "添加规则",
    editRule: "编辑规则",
    noRules: "尚未配置代理规则",
    noRulesHint: "创建代理规则以开始转发请求。",
    pathPrefix: "路径前缀",
    targetBaseUrl: "目标地址",
    pathPrefixPlaceholder: "例如 /proxy",
    targetBaseUrlPlaceholder: "例如 https://api.example.com",
    namePlaceholder: "例如 我的API代理",
    deleteRule: "删除规则",
    deleteRuleConfirm: (name: string) => `确定要删除 "${name}" 吗？所有关联的日志也将被移除。`,
    createRule: "创建规则",
    updateRule: "更新规则",
    saveChanges: "保存更改",
    usage: "使用方法",
    logsTitle: "代理日志",
    logsSubtitle: "检查代理的请求和响应详情。",
    clearLogs: "清空日志",
    clearLogsTitle: "清空代理日志？",
    clearLogsDesc: "此操作无法撤销。所有代理日志将被永久删除。",
    clearAll: "全部清空",
    noLogs: "未找到代理日志",
    noLogsHint: "代理规则处理请求后，日志将显示在此处。",
    time: "时间",
    method: "方法",
    url: "URL",
    latency: "延迟",
    requestHeaders: "请求头",
    requestBody: "请求体",
    responseHeaders: "响应头",
    responseBody: "响应体",
    viewDetails: "查看详情",
    detailTitle: "代理日志详情",
    allRules: "全部规则",
    filterByRule: "按规则筛选",
    streaming: "流式传输",
    autoRefresh: "自动刷新",
  },
```

**Step 4: Add sidebar entry**

Add to `sidebar` type in `Translations` interface:
```typescript
proxy: string;
```

Add to `en.sidebar`:
```typescript
proxy: "Proxy",
```

Add to `zh.sidebar`:
```typescript
proxy: "代理",
```

---

### Task 7: Frontend — Proxy Page (Rules + Logs)

**Files:**
- Create: `src/pages/Proxy.tsx`

This page uses Tabs to switch between "Rules" and "Logs" views.

**Rules tab:** Table listing all proxy rules with name, path_prefix, target_base_url, enabled status. Dialog for create/edit. Delete confirmation.

**Logs tab:** Table with method, URL, status, latency, time. Filter by rule. Expandable detail dialog showing full headers and body. Auto-refresh toggle.

Follows the same patterns as existing pages (Channels.tsx, RequestLogs.tsx).

This is a large file — implement following the exact same component patterns used in existing pages (shadcn Dialog, Table, Button, Badge, etc).

---

### Task 8: Frontend — Routing & Sidebar

**Files:**
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/layout/Sidebar.tsx` (add nav item)

**Step 1: Add route**

In `src/App.tsx`, import Proxy page and add route:

```tsx
import Proxy from "@/pages/Proxy";
// In Routes:
<Route path="proxy" element={<Proxy />} />
```

**Step 2: Add sidebar nav item**

In `src/components/layout/Sidebar.tsx`:

1. Import `Waypoints` icon from lucide-react (good icon for proxy/forwarding)
2. Add to `navItems` array after the usage-stats entry:
```tsx
{ to: "/proxy", icon: Waypoints, label: t.sidebar.proxy },
```

---

### Task Summary

| Task | Scope | Description |
|------|-------|-------------|
| 1 | DB | Migration: proxy_rules + proxy_logs tables |
| 2 | Rust | Data models: ProxyRule, ProxyLog structs |
| 3 | Rust | Generic proxy fallback handler + router registration |
| 4 | Rust | Tauri IPC commands for CRUD + log queries |
| 5 | TS | TypeScript types + Tauri IPC wrappers |
| 6 | TS | i18n translations (en + zh) |
| 7 | React | Proxy page with Rules + Logs tabs |
| 8 | React | App routing + sidebar navigation |
