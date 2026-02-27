# Route Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Channel + ModelMapping with a Route + Target system that does format conversion without model name mapping.

**Architecture:** A Route has a path_prefix and input_format. Requests to `/{prefix}/...` are decoded with the route's input_format, load-balanced across enabled targets, re-encoded to each target's upstream_format, and forwarded. Targets own multiple API keys with optional round-robin rotation.

**Tech Stack:** Rust/Axum/SQLx (backend), React/TypeScript/shadcn-ui (frontend), SQLite (database)

**Design doc:** `docs/plans/2026-02-27-route-redesign-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `src-tauri/migrations/007_routes.sql`

**Step 1: Write the migration SQL**

```sql
-- Drop old tables
DROP TABLE IF EXISTS model_mappings;
DROP TABLE IF EXISTS channel_api_keys;
DROP TABLE IF EXISTS channels;

-- Routes table
CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    path_prefix TEXT NOT NULL UNIQUE,
    input_format TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Route targets table
CREATE TABLE IF NOT EXISTS route_targets (
    id TEXT PRIMARY KEY NOT NULL,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    upstream_format TEXT NOT NULL,
    base_url TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    key_rotation INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Route target keys table
CREATE TABLE IF NOT EXISTS route_target_keys (
    id TEXT PRIMARY KEY NOT NULL,
    target_id TEXT NOT NULL REFERENCES route_targets(id) ON DELETE CASCADE,
    key_value TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
);

-- Add target_id and route_id to request_logs (channel_id kept as nullable legacy)
ALTER TABLE request_logs ADD COLUMN route_id TEXT;
ALTER TABLE request_logs ADD COLUMN target_id TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_routes_path_prefix ON routes(path_prefix);
CREATE INDEX IF NOT EXISTS idx_route_targets_route_id ON route_targets(route_id);
CREATE INDEX IF NOT EXISTS idx_route_target_keys_target_id ON route_target_keys(target_id);
```

**Step 2: Verify migration file exists**

Run: `ls src-tauri/migrations/`
Expected: `007_routes.sql` appears in the list

**Step 3: Commit**

```bash
git add src-tauri/migrations/007_routes.sql
git commit -m "feat(db): add routes migration, drop channels and model_mappings"
```

---

## Task 2: Rust Data Models

**Files:**
- Modify: `src-tauri/src/db/models.rs`

**Step 1: Replace models**

Replace the entire content of `src-tauri/src/db/models.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Route {
    pub id: String,
    pub name: String,
    pub path_prefix: String,
    pub input_format: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RouteTarget {
    pub id: String,
    pub route_id: String,
    pub upstream_format: String,
    pub base_url: String,
    pub weight: i32,
    pub enabled: bool,
    pub key_rotation: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RouteTargetKey {
    pub id: String,
    pub target_id: String,
    pub key_value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Token {
    pub id: String,
    pub name: Option<String>,
    pub key_value: String,
    pub quota_limit: Option<i64>,
    pub quota_used: i64,
    pub expires_at: Option<String>,
    pub allowed_models: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RequestLog {
    pub id: String,
    pub token_id: Option<String>,
    pub route_id: Option<String>,
    pub target_id: Option<String>,
    pub model: Option<String>,
    pub modality: Option<String>,
    pub input_format: Option<String>,
    pub output_format: Option<String>,
    pub status: Option<i32>,
    pub latency_ms: Option<i64>,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub created_at: String,
}

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

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ConversionRule {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub version: String,
    pub tags: Option<String>,
    pub rule_type: String,
    pub modality: String,
    pub decode_request: String,
    pub encode_request: String,
    pub decode_response: String,
    pub encode_response: String,
    pub decode_stream_chunk: Option<String>,
    pub encode_stream_chunk: Option<String>,
    pub http_config: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct VideoRecord {
    pub id: String,
    pub url: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub duration: Option<i64>,
    pub platform: String,
    pub formats: String,
    pub download_status: String,
    pub save_path: Option<String>,
    pub created_at: String,
}
```

**Step 2: Commit**

```bash
git add src-tauri/src/db/models.rs
git commit -m "feat(models): replace Channel/ModelMapping with Route/RouteTarget/RouteTargetKey"
```

---

## Task 3: Update error.rs

**Files:**
- Modify: `src-tauri/src/error.rs`

**Step 1: Replace NoChannel / AllChannelsFailed with route-specific variants**

In `src-tauri/src/error.rs`, replace these two variants:
```rust
    #[error("Channel not found for model: {0}")]
    NoChannel(String),

    #[error("All channels failed for model: {0}")]
    AllChannelsFailed(String),
```

With:
```rust
    #[error("No route found for path: {0}")]
    NoRoute(String),

    #[error("No available targets for route: {0}")]
    NoTarget(String),
```

**Step 2: Update IntoResponse match arms**

Replace:
```rust
            AppError::NoChannel(_) => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::AllChannelsFailed(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
```

With:
```rust
            AppError::NoRoute(_) => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::NoTarget(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
```

**Step 3: Commit**

```bash
git add src-tauri/src/error.rs
git commit -m "feat(error): replace channel errors with route/target errors"
```

---

## Task 4: Rewrite Balancer

**Files:**
- Modify: `src-tauri/src/routing/balancer.rs`

**Step 1: Replace balancer.rs entirely**

```rust
use crate::db::models::{RouteTarget, RouteTargetKey};
use crate::error::AppError;
use crate::routing::circuit::CircuitBreaker;
use rand::Rng;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

/// Holds round-robin counters for key rotation, keyed by target_id.
pub struct KeyRotationState {
    counters: Mutex<HashMap<String, AtomicUsize>>,
}

impl KeyRotationState {
    pub fn new() -> Self {
        Self {
            counters: Mutex::new(HashMap::new()),
        }
    }

    /// Get the next key index for a target using round-robin.
    pub fn next_index(&self, target_id: &str, key_count: usize) -> usize {
        if key_count == 0 {
            return 0;
        }
        let mut counters = self.counters.lock().unwrap();
        let counter = counters
            .entry(target_id.to_string())
            .or_insert_with(|| AtomicUsize::new(0));
        let idx = counter.fetch_add(1, Ordering::Relaxed) % key_count;
        idx
    }
}

pub struct SelectedTarget {
    pub target: RouteTarget,
    pub api_key: String,
    pub route_id: String,
}

/// Select the best available target for a route.
///
/// Algorithm:
/// 1. Fetch all enabled targets for the route
/// 2. Filter out targets with open circuit breakers
/// 3. Weighted random selection
/// 4. Pick API key: round-robin if key_rotation=true, first enabled key otherwise
pub async fn select_target(
    route_id: &str,
    db: &SqlitePool,
    circuit: &CircuitBreaker,
    rotation: &KeyRotationState,
) -> Result<SelectedTarget, AppError> {
    let targets = sqlx::query_as::<_, RouteTarget>(
        "SELECT * FROM route_targets WHERE route_id = ? AND enabled = 1",
    )
    .bind(route_id)
    .fetch_all(db)
    .await?;

    if targets.is_empty() {
        return Err(AppError::NoTarget(route_id.to_string()));
    }

    // Filter by circuit breaker
    let available: Vec<&RouteTarget> = targets
        .iter()
        .filter(|t| circuit.is_available(&t.id))
        .collect();

    if available.is_empty() {
        return Err(AppError::NoTarget(route_id.to_string()));
    }

    // Weighted random selection
    let target = weighted_random_select(&available);

    // Fetch enabled keys for this target
    let keys = sqlx::query_as::<_, RouteTargetKey>(
        "SELECT * FROM route_target_keys WHERE target_id = ? AND enabled = 1",
    )
    .bind(&target.id)
    .fetch_all(db)
    .await?;

    if keys.is_empty() {
        return Err(AppError::NoTarget(format!(
            "No API keys for target '{}'",
            target.id
        )));
    }

    // Pick key
    let key = if target.key_rotation {
        let idx = rotation.next_index(&target.id, keys.len());
        &keys[idx]
    } else {
        &keys[0]
    };

    Ok(SelectedTarget {
        target: target.clone(),
        api_key: key.key_value.clone(),
        route_id: route_id.to_string(),
    })
}

fn weighted_random_select<'a>(targets: &[&'a RouteTarget]) -> &'a RouteTarget {
    if targets.len() == 1 {
        return targets[0];
    }

    let total_weight: i32 = targets.iter().map(|t| t.weight.max(1)).sum();
    let mut rng = rand::rng();
    let mut pick = rng.random_range(0..total_weight);

    for t in targets {
        pick -= t.weight.max(1);
        if pick < 0 {
            return t;
        }
    }

    targets.last().unwrap()
}
```

**Step 2: Update routing/mod.rs to export KeyRotationState**

Replace `src-tauri/src/routing/mod.rs`:
```rust
pub mod balancer;
pub mod circuit;

pub use balancer::KeyRotationState;
```

**Step 3: Commit**

```bash
git add src-tauri/src/routing/balancer.rs src-tauri/src/routing/mod.rs
git commit -m "feat(routing): rewrite balancer for Route/Target model with key rotation"
```

---

## Task 5: Rewrite server/proxy.rs

**Files:**
- Modify: `src-tauri/src/server/proxy.rs`

**Step 1: Rewrite proxy.rs entirely**

```rust
use crate::db::models::{Route, Token};
use crate::error::AppError;
use crate::modality::chat::{self, ChatFormat};
use crate::routing::balancer::{self, KeyRotationState};
use crate::routing::circuit::CircuitBreaker;
use crate::server::middleware;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::Response;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio_stream::StreamExt;

#[derive(Clone)]
pub struct ProxyState {
    pub db: SqlitePool,
    pub http_client: reqwest::Client,
    pub circuit: Arc<CircuitBreaker>,
    pub rotation: Arc<KeyRotationState>,
}

// Known chat paths and their corresponding input format slugs
fn detect_chat_format_from_path(path: &str) -> Option<&'static str> {
    if path == "/v1/messages" || path.starts_with("/v1/messages?") {
        Some("anthropic")
    } else if path == "/v1/chat/completions" || path.starts_with("/v1/chat/completions?") {
        Some("openai-chat")
    } else if path == "/v1/responses" || path.starts_with("/v1/responses?") {
        Some("openai-responses")
    } else {
        None
    }
}

fn resolve_decoder(slug: &str) -> Result<Box<dyn chat::Decoder>, AppError> {
    ChatFormat::from_str_loose(slug)
        .map(chat::get_decoder)
        .ok_or_else(|| AppError::Codec(format!("Unknown format: {}", slug)))
}

fn resolve_encoder(slug: &str) -> Result<Box<dyn chat::Encoder>, AppError> {
    ChatFormat::from_str_loose(slug)
        .map(chat::get_encoder)
        .ok_or_else(|| AppError::Codec(format!("Unknown format: {}", slug)))
}

fn build_upstream_url(base_url: &str, format: ChatFormat, model: &str, stream: bool) -> String {
    let base = base_url.trim_end_matches('/');
    match format {
        ChatFormat::OpenaiChat | ChatFormat::Moonshot => {
            format!("{}/v1/chat/completions", base)
        }
        ChatFormat::OpenaiResponses => {
            format!("{}/v1/responses", base)
        }
        ChatFormat::Anthropic => {
            format!("{}/v1/messages", base)
        }
        ChatFormat::Gemini => {
            if stream {
                format!(
                    "{}/v1beta/models/{}:streamGenerateContent?alt=sse",
                    base, model
                )
            } else {
                format!("{}/v1beta/models/{}:generateContent", base, model)
            }
        }
    }
}

fn apply_auth(
    builder: reqwest::RequestBuilder,
    format: ChatFormat,
    api_key: &str,
) -> reqwest::RequestBuilder {
    match format {
        ChatFormat::OpenaiChat | ChatFormat::OpenaiResponses | ChatFormat::Moonshot => {
            builder.header("Authorization", format!("Bearer {}", api_key))
        }
        ChatFormat::Anthropic => builder
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        ChatFormat::Gemini => builder.header("x-goog-api-key", api_key),
    }
}

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
    "authorization",
    "x-api-key",
    "anthropic-version",
    "x-goog-api-key",
];

/// Main handler for all route-based proxy requests.
pub async fn handle_route_proxy(
    State(state): State<ProxyState>,
    req: Request,
) -> Result<Response, AppError> {
    let full_path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| q.to_string());
    let method = req.method().clone();
    let (parts, body) = req.into_parts();
    let headers = parts.headers;

    // Extract path prefix (first segment: "/anthropic" from "/anthropic/v1/messages")
    let path_prefix = extract_prefix(&full_path);

    // Look up route by path_prefix
    let route = sqlx::query_as::<_, Route>(
        "SELECT * FROM routes WHERE path_prefix = ? AND enabled = 1",
    )
    .bind(&path_prefix)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NoRoute(path_prefix.clone()))?;

    // Authenticate token
    let token_value = middleware::extract_bearer_token(&headers)?;
    let token = sqlx::query_as::<_, Token>(
        "SELECT * FROM tokens WHERE key_value = ? AND enabled = 1",
    )
    .bind(&token_value)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid API key".into()))?;

    if let Some(expires) = &token.expires_at {
        let now = chrono::Utc::now().naive_utc().to_string();
        if *expires < now {
            return Err(AppError::Unauthorized("API key expired".into()));
        }
    }

    // Strip prefix to get the sub-path
    let sub_path = strip_prefix(&full_path, &path_prefix);

    // Read body bytes
    let body_bytes = axum::body::to_bytes(body, 32 * 1024 * 1024)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read body: {}", e)))?;

    // Check if this path needs format conversion
    let path_format_hint = detect_chat_format_from_path(&sub_path);

    if path_format_hint.is_some() {
        // Format conversion path
        handle_format_conversion(
            &state, &route, &token.id, &headers, &body_bytes, &sub_path, &query,
        )
        .await
    } else {
        // Passthrough path: strip prefix, forward with target's auth
        handle_passthrough(&state, &route, &headers, &body_bytes, &sub_path, &query, method)
            .await
    }
}

/// Handle requests that need format conversion (known codec paths).
async fn handle_format_conversion(
    state: &ProxyState,
    route: &Route,
    token_id: &str,
    headers: &HeaderMap,
    body_bytes: &[u8],
    sub_path: &str,
    query: &Option<String>,
) -> Result<Response, AppError> {
    let start = std::time::Instant::now();

    // Decode input using route's input_format
    let decoder = resolve_decoder(&route.input_format)?;
    let ir = decoder.decode_request(body_bytes)?;

    let model = ir.model.clone();
    let input_fmt_str = route.input_format.clone();

    // Select target
    let selected = balancer::select_target(
        &route.id,
        &state.db,
        &state.circuit,
        &state.rotation,
    )
    .await?;

    let target = &selected.target;
    let api_key = &selected.api_key;
    let upstream_slug = target.upstream_format.clone();
    let output_fmt_str = upstream_slug.clone();

    // Encode IR → upstream format
    let upstream_encoder = resolve_encoder(&upstream_slug)?;
    let upstream_body = upstream_encoder.encode_request(&ir, &ir.model)?;

    // Build upstream URL
    let upstream_format = ChatFormat::from_str_loose(&upstream_slug)
        .ok_or_else(|| AppError::Codec(format!("Unknown upstream format: {}", upstream_slug)))?;
    let upstream_url = build_upstream_url(&target.base_url, upstream_format, &ir.model, ir.stream);

    // Build request
    let mut req_builder = state
        .http_client
        .post(&upstream_url)
        .header("Content-Type", "application/json")
        .body(upstream_body);
    req_builder = apply_auth(req_builder, upstream_format, api_key);

    let request_body_str = String::from_utf8_lossy(body_bytes).to_string();
    let target_id = target.id.clone();
    let route_id = route.id.clone();

    // Send
    let upstream_resp = req_builder.send().await;
    let upstream_resp = match upstream_resp {
        Ok(r) => r,
        Err(e) => {
            state.circuit.record_failure(&target.id);
            let latency = start.elapsed().as_millis() as i64;
            log_request(
                &state.db, token_id, &route_id, &target_id, &model, "chat",
                &input_fmt_str, &output_fmt_str, None, latency, None, None,
                Some(&request_body_str), Some(&e.to_string()),
            ).await;
            return Err(AppError::HttpClient(e));
        }
    };

    let status = upstream_resp.status();
    if !status.is_success() {
        state.circuit.record_failure(&target.id);
        let error_body = upstream_resp.text().await.unwrap_or_default();
        let latency = start.elapsed().as_millis() as i64;
        log_request(
            &state.db, token_id, &route_id, &target_id, &model, "chat",
            &input_fmt_str, &output_fmt_str, Some(status.as_u16() as i32),
            latency, None, None, Some(&request_body_str), Some(&error_body),
        ).await;
        return Err(AppError::Upstream { status: status.as_u16(), body: error_body });
    }

    state.circuit.record_success(&target.id);

    if ir.stream {
        let latency = start.elapsed().as_millis() as i64;
        let log_id = log_request(
            &state.db, token_id, &route_id, &target_id, &model, "chat",
            &input_fmt_str, &output_fmt_str, Some(200), latency, None, None,
            Some(&request_body_str), None,
        ).await;
        return proxy_stream(
            upstream_resp,
            upstream_slug.clone(),
            route.input_format.clone(),
            state.db.clone(),
            log_id,
        ).await;
    }

    // Non-streaming
    let resp_bytes = upstream_resp.bytes().await?;
    let upstream_decoder = resolve_decoder(&upstream_slug)?;
    let ir_response = upstream_decoder.decode_response(&resp_bytes)?;
    let output_encoder = resolve_encoder(&route.input_format)?;
    let output_bytes = output_encoder.encode_response(&ir_response)?;

    let latency = start.elapsed().as_millis() as i64;
    let prompt_tokens = ir_response.usage.as_ref().map(|u| u.prompt_tokens as i64);
    let completion_tokens = ir_response.usage.as_ref().map(|u| u.completion_tokens as i64);
    let resp_body_str = String::from_utf8_lossy(&output_bytes).to_string();

    log_request(
        &state.db, token_id, &route_id, &target_id, &model, "chat",
        &input_fmt_str, &output_fmt_str, Some(200), latency,
        prompt_tokens, completion_tokens,
        Some(&request_body_str), Some(&resp_body_str),
    ).await;

    if let (Some(pt), Some(ct)) = (prompt_tokens, completion_tokens) {
        let _ = sqlx::query("UPDATE tokens SET quota_used = quota_used + ? WHERE id = ?")
            .bind(pt + ct)
            .bind(token_id)
            .execute(&state.db)
            .await;
    }

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Body::from(output_bytes))
        .unwrap())
}

/// Passthrough: strip prefix, replace auth, forward as-is.
async fn handle_passthrough(
    state: &ProxyState,
    route: &Route,
    headers: &HeaderMap,
    body_bytes: &[u8],
    sub_path: &str,
    query: &Option<String>,
    method: axum::http::Method,
) -> Result<Response, AppError> {
    let selected = balancer::select_target(
        &route.id,
        &state.db,
        &state.circuit,
        &state.rotation,
    )
    .await?;

    let target = &selected.target;
    let api_key = &selected.api_key;

    let base = target.base_url.trim_end_matches('/');
    let target_url = match query {
        Some(q) => format!("{}{}?{}", base, sub_path, q),
        None => format!("{}{}", base, sub_path),
    };

    let upstream_format = ChatFormat::from_str_loose(&target.upstream_format);

    let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .map_err(|_| AppError::BadRequest(format!("Unsupported method: {}", method)))?;

    let mut req_builder = state.http_client.request(reqwest_method, &target_url);

    // Forward headers, skip hop-by-hop and auth headers (we'll replace auth)
    for (name, value) in headers.iter() {
        let name_lower = name.as_str().to_lowercase();
        if HOP_BY_HOP.contains(&name_lower.as_str()) {
            continue;
        }
        if let Ok(v) = value.to_str() {
            req_builder = req_builder.header(name.as_str(), v);
        }
    }

    // Apply target's auth
    if let Some(format) = upstream_format {
        req_builder = apply_auth(req_builder, format, api_key);
    }

    if !body_bytes.is_empty() {
        req_builder = req_builder.body(body_bytes.to_vec());
    }

    let upstream_resp = req_builder.send().await.map_err(AppError::HttpClient)?;

    let status = upstream_resp.status();
    let resp_headers = upstream_resp.headers().clone();

    let content_type = resp_headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let is_streaming = content_type.contains("text/event-stream");

    if is_streaming {
        let byte_stream = upstream_resp.bytes_stream();
        let mut resp = Response::builder().status(status);
        for (name, value) in resp_headers.iter() {
            if HOP_BY_HOP.contains(&name.as_str().to_lowercase().as_str()) {
                continue;
            }
            if let (Ok(hn), Ok(hv)) = (
                HeaderName::from_bytes(name.as_str().as_bytes()),
                HeaderValue::from_bytes(value.as_bytes()),
            ) {
                resp = resp.header(hn, hv);
            }
        }
        return Ok(resp.body(Body::from_stream(byte_stream)).unwrap());
    }

    let resp_bytes = upstream_resp.bytes().await.unwrap_or_default();
    let mut resp = Response::builder().status(status);
    for (name, value) in resp_headers.iter() {
        if HOP_BY_HOP.contains(&name.as_str().to_lowercase().as_str()) {
            continue;
        }
        if let (Ok(hn), Ok(hv)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            resp = resp.header(hn, hv);
        }
    }
    Ok(resp.body(Body::from(resp_bytes)).unwrap())
}

/// Extract the first path segment as route prefix.
/// "/anthropic/v1/messages" → "/anthropic"
fn extract_prefix(path: &str) -> String {
    let trimmed = path.trim_start_matches('/');
    let first_segment = trimmed.split('/').next().unwrap_or("");
    format!("/{}", first_segment)
}

/// Strip the route prefix from the path.
/// strip_prefix("/anthropic/v1/messages", "/anthropic") → "/v1/messages"
fn strip_prefix(path: &str, prefix: &str) -> String {
    let prefix_trimmed = prefix.trim_end_matches('/');
    match path.strip_prefix(prefix_trimmed) {
        Some(rest) if rest.is_empty() => "/".to_string(),
        Some(rest) => rest.to_string(),
        None => path.to_string(),
    }
}

/// Handle streaming proxy: pipe upstream SSE → decode → re-encode → downstream SSE.
async fn proxy_stream(
    upstream_resp: reqwest::Response,
    upstream_slug: String,
    output_slug: String,
    db: SqlitePool,
    log_id: String,
) -> Result<Response, AppError> {
    let upstream_decoder = resolve_decoder(&upstream_slug)?;
    let output_encoder = resolve_encoder(&output_slug)?;

    let byte_stream = upstream_resp.bytes_stream();

    let sse_stream = async_stream::stream! {
        let mut buffer = String::new();
        let mut byte_stream = Box::pin(byte_stream);
        let mut response_body = String::new();
        let mut has_response_chunk = false;
        let mut stream_done = false;

        while !stream_done {
            let chunk_result = match byte_stream.next().await {
                Some(c) => c,
                None => break,
            };
            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Upstream stream error: {}", e);
                    break;
                }
            };

            match std::str::from_utf8(&chunk) {
                Ok(text) => buffer.push_str(text),
                Err(_) => buffer.push_str(&String::from_utf8_lossy(&chunk)),
            }

            while let Some(pos) = buffer.find("\n\n") {
                let event_block = buffer[..pos].to_owned();
                buffer.drain(..pos + 2);

                for line in event_block.lines() {
                    let data = if let Some(d) = line.strip_prefix("data: ") {
                        d.trim()
                    } else if let Some(d) = line.strip_prefix("data:") {
                        d.trim()
                    } else {
                        continue;
                    };

                    if upstream_decoder.is_stream_done(data) {
                        if let Some(done) = output_encoder.stream_done_signal() {
                            yield Ok::<_, std::convert::Infallible>(
                                format!("data: {}\n\n", done)
                            );
                        }
                        stream_done = true;
                        break;
                    }

                    match upstream_decoder.decode_stream_chunk(data) {
                        Ok(Some(ir_chunk)) => {
                            match output_encoder.encode_stream_chunk(&ir_chunk) {
                                Ok(Some(encoded)) => {
                                    if has_response_chunk {
                                        response_body.push(',');
                                    } else {
                                        response_body.push('[');
                                        has_response_chunk = true;
                                    }
                                    response_body.push_str(&encoded);
                                    yield Ok(format!("data: {}\n\n", encoded));
                                }
                                Ok(None) => {}
                                Err(e) => { log::error!("Encode stream chunk error: {}", e); }
                            }
                        }
                        Ok(None) => {}
                        Err(e) => { log::error!("Decode stream chunk error: {}", e); }
                    }
                }
                if stream_done { break; }
            }
        }

        if has_response_chunk {
            response_body.push(']');
            let _ = sqlx::query("UPDATE request_logs SET response_body = ? WHERE id = ?")
                .bind(&response_body)
                .bind(&log_id)
                .execute(&db)
                .await;
        }
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(Body::from_stream(sse_stream))
        .unwrap())
}

#[allow(clippy::too_many_arguments)]
async fn log_request(
    db: &SqlitePool,
    token_id: &str,
    route_id: &str,
    target_id: &str,
    model: &str,
    modality: &str,
    input_format: &str,
    output_format: &str,
    status: Option<i32>,
    latency_ms: i64,
    prompt_tokens: Option<i64>,
    completion_tokens: Option<i64>,
    request_body: Option<&str>,
    response_body: Option<&str>,
) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "INSERT INTO request_logs (id, token_id, route_id, target_id, model, modality, input_format, output_format, status, latency_ms, prompt_tokens, completion_tokens, request_body, response_body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(token_id).bind(route_id).bind(target_id)
    .bind(model).bind(modality).bind(input_format).bind(output_format)
    .bind(status).bind(latency_ms).bind(prompt_tokens).bind(completion_tokens)
    .bind(request_body).bind(response_body).bind(&now)
    .execute(db).await;

    if let Err(e) = result {
        log::error!("Failed to log request: {}", e);
    }
    id
}
```

**Step 2: Commit**

```bash
git add src-tauri/src/server/proxy.rs
git commit -m "feat(proxy): rewrite for route-based format conversion and passthrough"
```

---

## Task 6: Rewrite server/router.rs

**Files:**
- Modify: `src-tauri/src/server/router.rs`

**Step 1: Replace router.rs**

```rust
use super::generic_proxy::{self, GenericProxyState};
use super::proxy::{self, ProxyState};
use crate::routing::circuit::CircuitBreaker;
use crate::routing::KeyRotationState;
use axum::body::{Body, Bytes};
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Json, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use axum::http::HeaderName;
use axum::http::HeaderValue;

pub async fn create_router(pool: SqlitePool) -> Router {
    let http_client = reqwest::Client::new();
    let circuit = Arc::new(CircuitBreaker::new(5, 60));
    let rotation = Arc::new(KeyRotationState::new());

    let generic_state = GenericProxyState {
        db: pool.clone(),
        http_client: http_client.clone(),
    };

    let proxy_state = ProxyState {
        db: pool,
        http_client,
        circuit,
        rotation,
    };

    Router::new()
        .route("/health", get(health_check))
        .route("/video-proxy", get(handle_video_proxy))
        // All other routes handled by route-based proxy
        .fallback(axum::routing::any(proxy::handle_route_proxy).with_state(proxy_state))
        .layer(CorsLayer::permissive())
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

#[derive(Deserialize)]
struct VideoProxyQuery {
    url: String,
}

async fn handle_video_proxy(
    State(state): State<ProxyState>,
    headers: HeaderMap,
    Query(query): Query<VideoProxyQuery>,
) -> Result<Response<Body>, crate::error::AppError> {
    let video_url = &query.url;

    let resolved_url = if video_url.contains("aweme.snssdk.com")
        || video_url.contains("api-h2.amemv.com")
    {
        let no_redirect_client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| crate::error::AppError::Internal(format!("Failed to build HTTP client: {}", e)))?;
        let resp = no_redirect_client
            .get(video_url)
            .send()
            .await
            .map_err(|e| crate::error::AppError::Internal(format!("Failed to resolve redirect: {}", e)))?;
        if resp.status().is_redirection() {
            resp.headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(video_url)
                .to_string()
        } else {
            video_url.clone()
        }
    } else {
        video_url.clone()
    };

    let mut req = state.http_client.get(&resolved_url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

    if video_url.contains("bilibili.com") || video_url.contains("bilivideo") {
        req = req.header("Referer", "https://www.bilibili.com/");
    }

    if let Some(range) = headers.get("range") {
        req = req.header("Range", range.clone());
    }

    let upstream = req
        .send()
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("Failed to fetch video: {}", e)))?;

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();

    let mut response = Response::builder()
        .status(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK));

    let passthrough_headers = ["content-type", "content-length", "content-range", "accept-ranges"];
    for name in passthrough_headers {
        if let Some(val) = upstream_headers.get(name) {
            response = response.header(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_bytes(val.as_bytes()).unwrap(),
            );
        }
    }

    response = response.header("Access-Control-Allow-Origin", "*");

    let stream = upstream.bytes_stream();
    let body = Body::from_stream(stream);

    response
        .body(body)
        .map_err(|e| crate::error::AppError::Internal(format!("Failed to build response: {}", e)))
}
```

**Step 2: Commit**

```bash
git add src-tauri/src/server/router.rs
git commit -m "feat(router): replace fixed routes with dynamic route-based fallback handler"
```

---

## Task 7: Add Route Tauri Commands

**Files:**
- Create: `src-tauri/src/commands/routes.rs`

**Step 1: Write routes.rs**

```rust
use crate::db::models::{Route, RouteTarget, RouteTargetKey};
use crate::error::IpcError;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

// DTO for creating/updating a target with its keys in one operation
#[derive(Debug, Deserialize)]
pub struct TargetInput {
    pub id: Option<String>,  // present when updating
    pub upstream_format: String,
    pub base_url: String,
    pub weight: i32,
    pub enabled: bool,
    pub key_rotation: bool,
    pub keys: Vec<String>,  // plaintext key values
}

fn validate_format(format: &str) -> Result<(), IpcError> {
    let valid = ["openai-chat", "openai-responses", "anthropic", "gemini", "moonshot"];
    if valid.contains(&format) {
        Ok(())
    } else {
        Err(IpcError::validation(format!("Unsupported format: {}", format)))
    }
}

fn validate_path_prefix(prefix: &str) -> Result<(), IpcError> {
    if !prefix.starts_with('/') {
        return Err(IpcError::validation("path_prefix must start with '/'"));
    }
    if prefix.len() < 2 {
        return Err(IpcError::validation("path_prefix must not be empty after '/'"));
    }
    if prefix[1..].contains('/') {
        return Err(IpcError::validation("path_prefix must be a single segment (no '/' after the first)"));
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct RouteWithTargets {
    #[serde(flatten)]
    pub route: Route,
    pub targets: Vec<TargetWithKeys>,
}

#[derive(Debug, Serialize)]
pub struct TargetWithKeys {
    #[serde(flatten)]
    pub target: RouteTarget,
    pub keys: Vec<RouteTargetKey>,
}

#[tauri::command]
pub async fn list_routes(state: State<'_, AppState>) -> Result<Vec<RouteWithTargets>, IpcError> {
    let routes = sqlx::query_as::<_, Route>(
        "SELECT * FROM routes ORDER BY created_at ASC"
    )
    .fetch_all(&state.db)
    .await?;

    let mut result = Vec::new();
    for route in routes {
        let targets = sqlx::query_as::<_, RouteTarget>(
            "SELECT * FROM route_targets WHERE route_id = ? ORDER BY created_at ASC"
        )
        .bind(&route.id)
        .fetch_all(&state.db)
        .await?;

        let mut targets_with_keys = Vec::new();
        for target in targets {
            let keys = sqlx::query_as::<_, RouteTargetKey>(
                "SELECT * FROM route_target_keys WHERE target_id = ? ORDER BY id ASC"
            )
            .bind(&target.id)
            .fetch_all(&state.db)
            .await?;
            targets_with_keys.push(TargetWithKeys { target, keys });
        }

        result.push(RouteWithTargets { route, targets: targets_with_keys });
    }
    Ok(result)
}

#[tauri::command]
pub async fn create_route(
    state: State<'_, AppState>,
    name: String,
    path_prefix: String,
    input_format: String,
    enabled: bool,
    targets: Vec<TargetInput>,
) -> Result<RouteWithTargets, IpcError> {
    validate_path_prefix(&path_prefix)?;
    validate_format(&input_format)?;

    let route_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO routes (id, name, path_prefix, input_format, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&route_id).bind(&name).bind(&path_prefix)
    .bind(&input_format).bind(enabled).bind(&now).bind(&now)
    .execute(&state.db).await?;

    save_targets(&state.db, &route_id, &targets).await?;

    get_route_with_targets(&state.db, &route_id).await
}

#[tauri::command]
pub async fn update_route(
    state: State<'_, AppState>,
    id: String,
    name: String,
    path_prefix: String,
    input_format: String,
    enabled: bool,
    targets: Vec<TargetInput>,
) -> Result<RouteWithTargets, IpcError> {
    validate_path_prefix(&path_prefix)?;
    validate_format(&input_format)?;

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE routes SET name=?, path_prefix=?, input_format=?, enabled=?, updated_at=? WHERE id=?"
    )
    .bind(&name).bind(&path_prefix).bind(&input_format)
    .bind(enabled).bind(&now).bind(&id)
    .execute(&state.db).await?;

    // Delete all existing targets (cascade deletes keys) and recreate
    sqlx::query("DELETE FROM route_targets WHERE route_id = ?")
        .bind(&id)
        .execute(&state.db).await?;

    save_targets(&state.db, &id, &targets).await?;

    get_route_with_targets(&state.db, &id).await
}

#[tauri::command]
pub async fn delete_route(state: State<'_, AppState>, id: String) -> Result<(), IpcError> {
    sqlx::query("DELETE FROM routes WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}

async fn save_targets(
    db: &sqlx::SqlitePool,
    route_id: &str,
    targets: &[TargetInput],
) -> Result<(), IpcError> {
    let now = chrono::Utc::now().to_rfc3339();
    for target_input in targets {
        validate_format(&target_input.upstream_format)?;

        let target_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO route_targets (id, route_id, upstream_format, base_url, weight, enabled, key_rotation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&target_id).bind(route_id)
        .bind(&target_input.upstream_format).bind(&target_input.base_url)
        .bind(target_input.weight).bind(target_input.enabled)
        .bind(target_input.key_rotation).bind(&now)
        .execute(db).await?;

        for key_value in &target_input.keys {
            if key_value.trim().is_empty() {
                continue;
            }
            let key_id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO route_target_keys (id, target_id, key_value, enabled) VALUES (?, ?, ?, 1)"
            )
            .bind(&key_id).bind(&target_id).bind(key_value.trim())
            .execute(db).await?;
        }
    }
    Ok(())
}

async fn get_route_with_targets(
    db: &sqlx::SqlitePool,
    route_id: &str,
) -> Result<RouteWithTargets, IpcError> {
    let route = sqlx::query_as::<_, Route>("SELECT * FROM routes WHERE id = ?")
        .bind(route_id)
        .fetch_one(db)
        .await?;

    let targets = sqlx::query_as::<_, RouteTarget>(
        "SELECT * FROM route_targets WHERE route_id = ? ORDER BY created_at ASC"
    )
    .bind(route_id)
    .fetch_all(db)
    .await?;

    let mut targets_with_keys = Vec::new();
    for target in targets {
        let keys = sqlx::query_as::<_, RouteTargetKey>(
            "SELECT * FROM route_target_keys WHERE target_id = ? ORDER BY id ASC"
        )
        .bind(&target.id)
        .fetch_all(db)
        .await?;
        targets_with_keys.push(TargetWithKeys { target, keys });
    }

    Ok(RouteWithTargets { route, targets: targets_with_keys })
}
```

**Step 2: Commit**

```bash
git add src-tauri/src/commands/routes.rs
git commit -m "feat(commands): add route CRUD Tauri commands"
```

---

## Task 8: Update commands/mod.rs and lib.rs

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Update commands/mod.rs**

Replace the content of `src-tauri/src/commands/mod.rs`:

```rust
pub mod config;
pub mod routes;
pub mod tokens;
pub mod request_logs;
pub mod proxy;
pub mod rules;
pub mod video;

#[derive(serde::Serialize)]
pub struct PaginatedResult<T: serde::Serialize> {
    pub items: Vec<T>,
    pub total: i64,
}
```

**Step 2: Update lib.rs invoke_handler**

In `src-tauri/src/lib.rs`, replace the entire `invoke_handler!` block:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::get_server_status,
            commands::config::update_config,
            commands::routes::list_routes,
            commands::routes::create_route,
            commands::routes::update_route,
            commands::routes::delete_route,
            commands::tokens::list_tokens,
            commands::tokens::create_token,
            commands::tokens::update_token,
            commands::tokens::delete_token,
            commands::tokens::reset_token_quota,
            commands::request_logs::list_request_logs,
            commands::request_logs::get_request_log,
            commands::request_logs::clear_request_logs,
            commands::request_logs::get_usage_stats,
            commands::request_logs::retry_request_log,
            commands::proxy::list_proxy_rules,
            commands::proxy::create_proxy_rule,
            commands::proxy::update_proxy_rule,
            commands::proxy::delete_proxy_rule,
            commands::proxy::list_proxy_logs,
            commands::proxy::get_proxy_log,
            commands::proxy::clear_proxy_logs,
            commands::rules::list_conversion_rules,
            commands::rules::get_conversion_rule,
            commands::rules::set_conversion_rule_enabled,
            commands::video::parse_video_url,
            commands::video::download_video,
            commands::video::cancel_video_download,
            commands::video::open_in_folder,
            commands::video::save_video_record,
            commands::video::list_video_records,
            commands::video::delete_video_record,
            commands::video::clear_video_records,
            commands::video::update_video_record_status,
        ])
```

**Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -50`
Expected: No errors (warnings are OK)

**Step 4: Commit**

```bash
git add src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(lib): register route commands, remove channel/mapping commands"
```

---

## Task 9: Delete Old Command Files

**Files:**
- Delete: `src-tauri/src/commands/channels.rs`
- Delete: `src-tauri/src/commands/model_mappings.rs`

**Step 1: Delete the files**

```bash
rm src-tauri/src/commands/channels.rs
rm src-tauri/src/commands/model_mappings.rs
```

**Step 2: Verify Rust still compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -50`
Expected: No errors

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete channels and model_mappings command files"
```

---

## Task 10: Frontend — Update tauri.ts

**Files:**
- Modify: `src/lib/tauri.ts`

**Step 1: Remove channel and model mapping sections, add route types and commands**

Replace everything from `// === Channel types ===` through the end of `// === Model Mapping commands ===` with:

```typescript
// === Route types ===

export interface RouteTargetKey {
  id: string;
  target_id: string;
  key_value: string;
  enabled: boolean;
}

export interface RouteTarget {
  id: string;
  route_id: string;
  upstream_format: string;
  base_url: string;
  weight: number;
  enabled: boolean;
  key_rotation: boolean;
  created_at: string;
  keys: RouteTargetKey[];
}

export interface Route {
  id: string;
  name: string;
  path_prefix: string;
  input_format: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  targets: RouteTarget[];
}

export interface TargetInput {
  upstream_format: string;
  base_url: string;
  weight: number;
  enabled: boolean;
  key_rotation: boolean;
  keys: string[];
}

export const SUPPORTED_FORMATS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai-chat", label: "OpenAI Chat" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "gemini", label: "Gemini" },
  { value: "moonshot", label: "Moonshot" },
] as const;

// === Route commands ===

export async function listRoutes(): Promise<Route[]> {
  return invoke<Route[]>("list_routes");
}

export async function createRoute(data: {
  name: string;
  path_prefix: string;
  input_format: string;
  enabled: boolean;
  targets: TargetInput[];
}): Promise<Route> {
  return invoke<Route>("create_route", {
    name: data.name,
    pathPrefix: data.path_prefix,
    inputFormat: data.input_format,
    enabled: data.enabled,
    targets: data.targets,
  });
}

export async function updateRoute(data: {
  id: string;
  name: string;
  path_prefix: string;
  input_format: string;
  enabled: boolean;
  targets: TargetInput[];
}): Promise<Route> {
  return invoke<Route>("update_route", {
    id: data.id,
    name: data.name,
    pathPrefix: data.path_prefix,
    inputFormat: data.input_format,
    enabled: data.enabled,
    targets: data.targets,
  });
}

export async function deleteRoute(id: string): Promise<void> {
  return invoke<void>("delete_route", { id });
}
```

Also update the `RequestLog` type — replace `channel_id` with `route_id` and `target_id`:

```typescript
export interface RequestLog {
  id: string;
  token_id: string | null;
  route_id: string | null;
  target_id: string | null;
  model: string | null;
  modality: string | null;
  input_format: string | null;
  output_format: string | null;
  status: number | null;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  request_body: string | null;
  response_body: string | null;
  created_at: string;
}
```

**Step 2: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat(tauri): add route types and commands, remove channel/mapping types"
```

---

## Task 11: Frontend — Routes Page

**Files:**
- Create: `src/pages/Routes.tsx`

**Step 1: Write Routes.tsx**

```tsx
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Route,
  TargetInput,
  SUPPORTED_FORMATS,
  listRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  parseIpcError,
} from "@/lib/tauri";

interface TargetFormState {
  upstream_format: string;
  base_url: string;
  weight: number;
  enabled: boolean;
  key_rotation: boolean;
  keys: string[];
  expanded: boolean;
}

interface RouteFormState {
  name: string;
  path_prefix: string;
  input_format: string;
  enabled: boolean;
  targets: TargetFormState[];
}

const defaultTarget = (): TargetFormState => ({
  upstream_format: "openai-chat",
  base_url: "",
  weight: 1,
  enabled: true,
  key_rotation: true,
  keys: [""],
  expanded: true,
});

const defaultForm = (): RouteFormState => ({
  name: "",
  path_prefix: "/",
  input_format: "anthropic",
  enabled: true,
  targets: [defaultTarget()],
});

function formatLabel(value: string): string {
  return SUPPORTED_FORMATS.find((f) => f.value === value)?.label ?? value;
}

interface RoutesProps {
  embedded?: boolean;
}

export default function Routes({ embedded }: RoutesProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [form, setForm] = useState<RouteFormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRoutes(await listRoutes());
    } catch (e) {
      setError(parseIpcError(e).message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingRoute(null);
    setForm(defaultForm());
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(route: Route) {
    setEditingRoute(route);
    setForm({
      name: route.name,
      path_prefix: route.path_prefix,
      input_format: route.input_format,
      enabled: route.enabled,
      targets: route.targets.map((t) => ({
        upstream_format: t.upstream_format,
        base_url: t.base_url,
        weight: t.weight,
        enabled: t.enabled,
        key_rotation: t.key_rotation,
        keys: t.keys.length > 0 ? t.keys.map((k) => k.key_value) : [""],
        expanded: true,
      })),
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setFormError(null);

    // Validate
    if (!form.name.trim()) {
      setFormError("请输入路由名称");
      return;
    }
    if (!form.path_prefix.startsWith("/") || form.path_prefix.length < 2) {
      setFormError("路径前缀必须以 / 开头且不能为空");
      return;
    }
    if (form.path_prefix.slice(1).includes("/")) {
      setFormError("路径前缀只能有一个层级，例如 /anthropic");
      return;
    }
    if (form.targets.length === 0) {
      setFormError("至少需要一个上游目标");
      return;
    }
    for (const t of form.targets) {
      if (!t.base_url.trim()) {
        setFormError("每个目标都需要填写 Base URL");
        return;
      }
      const validKeys = t.keys.filter((k) => k.trim());
      if (validKeys.length === 0) {
        setFormError("每个目标至少需要一个 API Key");
        return;
      }
    }

    const targets: TargetInput[] = form.targets.map((t) => ({
      upstream_format: t.upstream_format,
      base_url: t.base_url.trim(),
      weight: t.weight,
      enabled: t.enabled,
      key_rotation: t.key_rotation,
      keys: t.keys.filter((k) => k.trim()),
    }));

    setSaving(true);
    try {
      if (editingRoute) {
        await updateRoute({
          id: editingRoute.id,
          name: form.name.trim(),
          path_prefix: form.path_prefix.trim(),
          input_format: form.input_format,
          enabled: form.enabled,
          targets,
        });
      } else {
        await createRoute({
          name: form.name.trim(),
          path_prefix: form.path_prefix.trim(),
          input_format: form.input_format,
          enabled: form.enabled,
          targets,
        });
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      setFormError(parseIpcError(e).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteRoute(deleteId);
      await load();
    } catch (e) {
      setError(parseIpcError(e).message);
    } finally {
      setDeleteId(null);
    }
  }

  function updateTarget(idx: number, patch: Partial<TargetFormState>) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  }

  function addTarget() {
    setForm((prev) => ({ ...prev, targets: [...prev.targets, defaultTarget()] }));
  }

  function removeTarget(idx: number) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.filter((_, i) => i !== idx),
    }));
  }

  function updateKey(targetIdx: number, keyIdx: number, value: string) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) =>
        i === targetIdx
          ? { ...t, keys: t.keys.map((k, j) => (j === keyIdx ? value : k)) }
          : t
      ),
    }));
  }

  function addKey(targetIdx: number) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) =>
        i === targetIdx ? { ...t, keys: [...t.keys, ""] } : t
      ),
    }));
  }

  function removeKey(targetIdx: number, keyIdx: number) {
    setForm((prev) => ({
      ...prev,
      targets: prev.targets.map((t, i) =>
        i === targetIdx ? { ...t, keys: t.keys.filter((_, j) => j !== keyIdx) } : t
      ),
    }));
  }

  const containerClass = embedded ? "p-6" : "container mx-auto p-6";

  return (
    <div className={containerClass}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">路由</h2>
          <p className="text-muted-foreground text-sm">
            配置格式转换路由，将客户端请求转发到上游供应商
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          新建路由
        </Button>
      </div>

      {error && (
        <div className="text-destructive mb-4 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">加载中...</div>
      ) : routes.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
          暂无路由，点击「新建路由」开始配置
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((route) => (
            <div
              key={route.id}
              className="rounded-lg border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{route.name}</span>
                      <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                        {route.path_prefix}
                      </code>
                      <Badge variant="outline" className="text-xs">
                        {formatLabel(route.input_format)}
                      </Badge>
                      {!route.enabled && (
                        <Badge variant="secondary" className="text-xs">
                          已禁用
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {route.targets.filter((t) => t.enabled).length} 个活跃目标
                      {" · "}
                      {route.targets.reduce((n, t) => n + t.keys.length, 0)} 个 Key
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(route)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteId(route.id)}
                  >
                    <Trash2 className="text-destructive h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRoute ? "编辑路由" : "新建路由"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>名称</Label>
                <Input
                  placeholder="我的 Anthropic 路由"
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>路径前缀</Label>
                <Input
                  placeholder="/anthropic"
                  value={form.path_prefix}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, path_prefix: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>输入格式（客户端使用的格式）</Label>
                <Select
                  value={form.input_format}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, input_format: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) =>
                    setForm((p) => ({ ...p, enabled: v }))
                  }
                />
                <Label>启用</Label>
              </div>
            </div>

            {/* Targets */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-base">上游目标</Label>
                <Button variant="outline" size="sm" onClick={addTarget}>
                  <Plus className="mr-1 h-3 w-3" />
                  添加目标
                </Button>
              </div>

              <div className="space-y-3">
                {form.targets.map((target, ti) => (
                  <div key={ti} className="rounded-md border p-3">
                    {/* Target header */}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-sm font-medium"
                        onClick={() =>
                          updateTarget(ti, { expanded: !target.expanded })
                        }
                      >
                        {target.expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        目标 {ti + 1}
                        {target.base_url && (
                          <span className="text-muted-foreground ml-1 font-normal">
                            · {target.base_url}
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={target.enabled}
                          onCheckedChange={(v) =>
                            updateTarget(ti, { enabled: v })
                          }
                        />
                        {form.targets.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTarget(ti)}
                          >
                            <Trash2 className="text-destructive h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {target.expanded && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">上游格式</Label>
                            <Select
                              value={target.upstream_format}
                              onValueChange={(v) =>
                                updateTarget(ti, { upstream_format: v })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SUPPORTED_FORMATS.map((f) => (
                                  <SelectItem key={f.value} value={f.value}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">权重</Label>
                            <Input
                              type="number"
                              min={1}
                              className="h-8 text-xs"
                              value={target.weight}
                              onChange={(e) =>
                                updateTarget(ti, {
                                  weight: parseInt(e.target.value) || 1,
                                })
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Base URL</Label>
                          <Input
                            className="h-8 text-xs"
                            placeholder="https://api.openai.com"
                            value={target.base_url}
                            onChange={(e) =>
                              updateTarget(ti, { base_url: e.target.value })
                            }
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            checked={target.key_rotation}
                            onCheckedChange={(v) =>
                              updateTarget(ti, { key_rotation: v })
                            }
                          />
                          <Label className="text-xs">Key 轮询</Label>
                        </div>

                        {/* API Keys */}
                        <div className="space-y-1.5">
                          <Label className="text-xs">API Keys</Label>
                          <div className="space-y-1.5">
                            {target.keys.map((key, ki) => (
                              <div key={ki} className="flex gap-1.5">
                                <Input
                                  className="h-7 flex-1 font-mono text-xs"
                                  placeholder="sk-..."
                                  type="password"
                                  value={key}
                                  onChange={(e) =>
                                    updateKey(ti, ki, e.target.value)
                                  }
                                />
                                {target.keys.length > 1 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => removeKey(ti, ki)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => addKey(ti)}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            添加 Key
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {formError && (
              <p className="text-destructive text-sm">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除路由将同时删除其所有目标和 API Key，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/Routes.tsx
git commit -m "feat(ui): add Routes page with inline target and key management"
```

---

## Task 12: Frontend — Update ApiGateway.tsx

**Files:**
- Modify: `src/pages/ApiGateway.tsx`

**Step 1: Replace ApiGateway.tsx**

```tsx
import { useSearchParams } from "react-router";
import {
  Network,
  FileCode2,
  KeyRound,
  ScrollText,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLanguage } from "@/lib/i18n";
import Routes from "@/pages/Routes";
import Rules from "@/pages/Rules";
import Tokens from "@/pages/Tokens";
import RequestLogs from "@/pages/RequestLogs";

const TABS = ["routes", "rules", "tokens", "request-logs"] as const;
type TabValue = (typeof TABS)[number];

function isValidTab(value: string): value is TabValue {
  return (TABS as readonly string[]).includes(value);
}

export default function ApiGateway() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();

  const tabParam = searchParams.get("tab") ?? "";
  const activeTab: TabValue = isValidTab(tabParam) ? tabParam : "routes";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  const tabItems = [
    { value: "routes" as TabValue, icon: Network, label: "路由" },
    { value: "rules" as TabValue, icon: FileCode2, label: t.sidebar.rules },
    { value: "tokens" as TabValue, icon: KeyRound, label: t.sidebar.tokens },
    { value: "request-logs" as TabValue, icon: ScrollText, label: t.sidebar.requestLogs },
  ];

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
      <TabsList className="mx-6 mt-4 w-fit">
        {tabItems.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="routes" className="flex-1 overflow-auto">
        <Routes embedded />
      </TabsContent>
      <TabsContent value="rules" className="flex-1 overflow-auto">
        <Rules embedded />
      </TabsContent>
      <TabsContent value="tokens" className="flex-1 overflow-auto">
        <Tokens embedded />
      </TabsContent>
      <TabsContent value="request-logs" className="flex-1 overflow-auto">
        <RequestLogs embedded />
      </TabsContent>
    </Tabs>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/ApiGateway.tsx
git commit -m "feat(ui): update ApiGateway tabs - replace channels/mappings with routes"
```

---

## Task 13: Delete Old Frontend Files

**Files:**
- Delete: `src/pages/Channels.tsx` (if exists)
- Delete: `src/pages/ModelMappings.tsx`

**Step 1: Check what exists and delete**

```bash
ls src/pages/
```

Delete any of these that exist:
```bash
rm -f src/pages/Channels.tsx
rm -f src/pages/ModelMappings.tsx
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: delete Channels and ModelMappings frontend pages"
```

---

## Task 14: Final Build Verification

**Step 1: Build Rust backend**

```bash
cd src-tauri && cargo build 2>&1 | tail -20
```
Expected: `Finished` with no errors

**Step 2: Build frontend**

```bash
cd .. && npm run build 2>&1 | tail -20
```
Expected: Build succeeds

**Step 3: Reset DB and run app**

```bash
make db-reset
```
Then launch the app and verify:
- [ ] Routes tab appears in API Gateway
- [ ] Can create a route with targets and keys in one dialog
- [ ] Channels and Model Mappings tabs are gone

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup after route redesign"
```
