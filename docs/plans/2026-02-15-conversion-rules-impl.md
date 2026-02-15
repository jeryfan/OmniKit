# Conversion Rules Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a user-configurable conversion rule engine (JSONata-based) that coexists with built-in Rust codecs, enabling users to create/edit/import/export API format transformation rules.

**Architecture:** Dual-track codec dispatch — built-in Rust codecs (fast path) and JSONata rule engine (flexible path) share the same Chat IR. A `RuleRegistry` provides unified lookup by slug. Rules are stored in SQLite, managed via Tauri IPC, and exposed in a new frontend page.

**Tech Stack:** `jsonata-rs` crate (JSONata engine), `serde_json` (IR serialization), existing Axum/SQLite/Tauri/React stack.

**Design Doc:** `docs/plans/2026-02-15-conversion-rules-design.md`

---

## Phase 1: Database & Data Model

### Task 1: Add `conversion_rule` table migration

**Files:**
- Create: `src-tauri/migrations/005_conversion_rules.sql`

**Step 1: Write the migration SQL**

```sql
-- 005_conversion_rules.sql

CREATE TABLE IF NOT EXISTS conversion_rules (
    id                   TEXT PRIMARY KEY,
    slug                 TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    description          TEXT,
    author               TEXT,
    version              TEXT NOT NULL DEFAULT '1.0.0',
    tags                 TEXT,          -- JSON array, e.g. '["chat","openai-compatible"]'
    rule_type            TEXT NOT NULL DEFAULT 'user',  -- "system" | "user"
    modality             TEXT NOT NULL DEFAULT 'chat',
    decode_request       TEXT NOT NULL,
    encode_request       TEXT NOT NULL,
    decode_response      TEXT NOT NULL,
    encode_response      TEXT NOT NULL,
    decode_stream_chunk  TEXT,          -- optional
    encode_stream_chunk  TEXT,          -- optional
    http_config          TEXT,          -- JSON: { auth_header_template, url_template, content_type }
    enabled              INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_rules_slug ON conversion_rules(slug);
```

**Step 2: Verify the migration runs**

Run: `cd src-tauri && cargo build 2>&1 | head -20`
Expected: Compiles without errors (sqlx will pick up the new migration automatically on next app start).

**Step 3: Commit**

```
feat(db): add conversion_rules table migration
```

---

### Task 2: Add `ConversionRule` model struct

**Files:**
- Modify: `src-tauri/src/db/models.rs` (append after line 93)

**Step 1: Add the struct**

Append to `src-tauri/src/db/models.rs`:

```rust
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
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: No errors.

**Step 3: Commit**

```
feat(db): add ConversionRule model struct
```

---

## Phase 2: Tauri IPC Commands for Rules CRUD

### Task 3: Add `commands/rules.rs` with CRUD operations

**Files:**
- Create: `src-tauri/src/commands/rules.rs`
- Modify: `src-tauri/src/commands/mod.rs` (line 6, add `pub mod rules;`)
- Modify: `src-tauri/src/lib.rs` (lines 24-60, register new commands)

**Step 1: Create `commands/rules.rs`**

```rust
use crate::db::models::ConversionRule;
use crate::error::IpcError;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_conversion_rules(
    state: State<'_, AppState>,
) -> Result<Vec<ConversionRule>, IpcError> {
    Ok(sqlx::query_as::<_, ConversionRule>(
        "SELECT * FROM conversion_rules ORDER BY rule_type ASC, name ASC",
    )
    .fetch_all(&state.db)
    .await?)
}

#[tauri::command]
pub async fn get_conversion_rule(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConversionRule, IpcError> {
    sqlx::query_as::<_, ConversionRule>("SELECT * FROM conversion_rules WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| IpcError::not_found("Rule not found"))
}

#[tauri::command]
pub async fn create_conversion_rule(
    state: State<'_, AppState>,
    slug: String,
    name: String,
    description: Option<String>,
    author: Option<String>,
    version: Option<String>,
    tags: Option<String>,
    modality: Option<String>,
    decode_request: String,
    encode_request: String,
    decode_response: String,
    encode_response: String,
    decode_stream_chunk: Option<String>,
    encode_stream_chunk: Option<String>,
    http_config: Option<String>,
) -> Result<ConversionRule, IpcError> {
    // Prevent creating system rules via IPC
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let ver = version.unwrap_or_else(|| "1.0.0".to_string());
    let mod_ = modality.unwrap_or_else(|| "chat".to_string());

    sqlx::query(
        "INSERT INTO conversion_rules (id, slug, name, description, author, version, tags, rule_type, modality, decode_request, encode_request, decode_response, encode_response, decode_stream_chunk, encode_stream_chunk, http_config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    )
    .bind(&id).bind(&slug).bind(&name).bind(&description).bind(&author)
    .bind(&ver).bind(&tags).bind(&mod_)
    .bind(&decode_request).bind(&encode_request)
    .bind(&decode_response).bind(&encode_response)
    .bind(&decode_stream_chunk).bind(&encode_stream_chunk)
    .bind(&http_config)
    .bind(&now).bind(&now)
    .execute(&state.db)
    .await?;

    Ok(sqlx::query_as::<_, ConversionRule>("SELECT * FROM conversion_rules WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db)
        .await?)
}

#[tauri::command]
pub async fn update_conversion_rule(
    state: State<'_, AppState>,
    id: String,
    slug: String,
    name: String,
    description: Option<String>,
    author: Option<String>,
    version: Option<String>,
    tags: Option<String>,
    modality: Option<String>,
    decode_request: String,
    encode_request: String,
    decode_response: String,
    encode_response: String,
    decode_stream_chunk: Option<String>,
    encode_stream_chunk: Option<String>,
    http_config: Option<String>,
    enabled: bool,
) -> Result<(), IpcError> {
    // Check rule_type — cannot edit system rules
    let existing = sqlx::query_as::<_, ConversionRule>(
        "SELECT * FROM conversion_rules WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| IpcError::not_found("Rule not found"))?;

    if existing.rule_type == "system" {
        return Err(IpcError::validation("Cannot edit system rules"));
    }

    let now = chrono::Utc::now().to_rfc3339();
    let ver = version.unwrap_or(existing.version);
    let mod_ = modality.unwrap_or(existing.modality);

    sqlx::query(
        "UPDATE conversion_rules SET slug = ?, name = ?, description = ?, author = ?, version = ?, tags = ?, modality = ?, decode_request = ?, encode_request = ?, decode_response = ?, encode_response = ?, decode_stream_chunk = ?, encode_stream_chunk = ?, http_config = ?, enabled = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&slug).bind(&name).bind(&description).bind(&author)
    .bind(&ver).bind(&tags).bind(&mod_)
    .bind(&decode_request).bind(&encode_request)
    .bind(&decode_response).bind(&encode_response)
    .bind(&decode_stream_chunk).bind(&encode_stream_chunk)
    .bind(&http_config).bind(enabled)
    .bind(&now).bind(&id)
    .execute(&state.db)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn delete_conversion_rule(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), IpcError> {
    // Cannot delete system rules
    let existing = sqlx::query_as::<_, ConversionRule>(
        "SELECT * FROM conversion_rules WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| IpcError::not_found("Rule not found"))?;

    if existing.rule_type == "system" {
        return Err(IpcError::validation("Cannot delete system rules"));
    }

    sqlx::query("DELETE FROM conversion_rules WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn duplicate_conversion_rule(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConversionRule, IpcError> {
    let source = sqlx::query_as::<_, ConversionRule>(
        "SELECT * FROM conversion_rules WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| IpcError::not_found("Rule not found"))?;

    let new_id = uuid::Uuid::new_v4().to_string();
    let new_slug = format!("{}-copy", source.slug);
    let new_name = format!("{} (Copy)", source.name);
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO conversion_rules (id, slug, name, description, author, version, tags, rule_type, modality, decode_request, encode_request, decode_response, encode_response, decode_stream_chunk, encode_stream_chunk, http_config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    )
    .bind(&new_id).bind(&new_slug).bind(&new_name)
    .bind(&source.description).bind(&source.author)
    .bind(&source.version).bind(&source.tags).bind(&source.modality)
    .bind(&source.decode_request).bind(&source.encode_request)
    .bind(&source.decode_response).bind(&source.encode_response)
    .bind(&source.decode_stream_chunk).bind(&source.encode_stream_chunk)
    .bind(&source.http_config)
    .bind(&now).bind(&now)
    .execute(&state.db)
    .await?;

    Ok(sqlx::query_as::<_, ConversionRule>("SELECT * FROM conversion_rules WHERE id = ?")
        .bind(&new_id)
        .fetch_one(&state.db)
        .await?)
}
```

**Step 2: Register the module in `commands/mod.rs`**

Add `pub mod rules;` after the existing module declarations (line 6 of `src-tauri/src/commands/mod.rs`).

**Step 3: Register commands in `lib.rs`**

In `src-tauri/src/lib.rs`, add these lines inside the `tauri::generate_handler![]` macro (after line 59):

```rust
commands::rules::list_conversion_rules,
commands::rules::get_conversion_rule,
commands::rules::create_conversion_rule,
commands::rules::update_conversion_rule,
commands::rules::delete_conversion_rule,
commands::rules::duplicate_conversion_rule,
```

**Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors.

**Step 5: Commit**

```
feat(commands): add conversion rules CRUD commands
```

---

## Phase 3: JSONata Rule Engine

### Task 4: Add `jsonata-rs` dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add the dependency**

Add to `[dependencies]` section of `src-tauri/Cargo.toml`:

```toml
jsonata-rs = "0.3"
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Downloads jsonata-rs and compiles. If `jsonata-rs` fails to compile or has compatibility issues, fall back to evaluating `bumpalo` requirements and adjust. Document any issues for later resolution.

**Step 3: Commit**

```
feat(deps): add jsonata-rs for rule engine
```

---

### Task 5: Create `rules/` module with JSONata engine wrapper

**Files:**
- Create: `src-tauri/src/rules/mod.rs`
- Create: `src-tauri/src/rules/engine.rs`
- Modify: `src-tauri/src/lib.rs` (line 5, add `mod rules;`)

**Step 1: Create `rules/mod.rs`**

```rust
pub mod engine;
pub mod registry;

use serde::{Deserialize, Serialize};

/// Represents a conversion rule's HTTP configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpConfig {
    #[serde(default = "default_auth_template")]
    pub auth_header_template: String,
    #[serde(default)]
    pub url_template: String,
    #[serde(default = "default_content_type")]
    pub content_type: String,
}

fn default_auth_template() -> String {
    "Bearer {{key}}".to_string()
}

fn default_content_type() -> String {
    "application/json".to_string()
}

impl HttpConfig {
    pub fn parse(json: Option<&str>) -> Option<Self> {
        json.and_then(|s| serde_json::from_str(s).ok())
    }
}
```

**Step 2: Create `rules/engine.rs`**

```rust
use crate::error::AppError;
use serde_json::Value;

/// Evaluate a JSONata expression against an input JSON value.
/// Returns the transformed JSON value.
pub fn evaluate(expression: &str, input: &Value) -> Result<Value, AppError> {
    use bumpalo::Bump;
    use jsonata_rs::JsonAta;

    let arena = Bump::new();
    let jsonata = JsonAta::new(expression, &arena).map_err(|e| {
        AppError::Codec(format!("JSONata parse error: {}", e))
    })?;

    let input_str = serde_json::to_string(input)
        .map_err(|e| AppError::Codec(format!("JSON serialize error: {}", e)))?;

    let result = jsonata.evaluate(Some(&input_str), None).map_err(|e| {
        AppError::Codec(format!("JSONata evaluation error: {}", e))
    })?;

    let result_value: Value = serde_json::from_str(&result)
        .map_err(|e| AppError::Codec(format!("JSONata output is not valid JSON: {}", e)))?;

    Ok(result_value)
}

/// Validate that a JSONata expression is syntactically correct.
/// Returns Ok(()) if valid, Err with message if invalid.
pub fn validate(expression: &str) -> Result<(), String> {
    use bumpalo::Bump;
    use jsonata_rs::JsonAta;

    let arena = Bump::new();
    JsonAta::new(expression, &arena).map_err(|e| format!("JSONata parse error: {}", e))?;
    Ok(())
}
```

**Step 3: Add `mod rules;` to `lib.rs`**

In `src-tauri/src/lib.rs`, add after line 5 (`mod routing;`):

```rust
mod rules;
```

**Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles. If `jsonata-rs` API differs (check docs.rs for actual API), adjust the `evaluate` function accordingly.

**Step 5: Commit**

```
feat(rules): add JSONata engine wrapper module
```

---

### Task 6: Create `rules/registry.rs` — unified codec dispatch

**Files:**
- Create: `src-tauri/src/rules/registry.rs`

**Step 1: Write the registry**

```rust
use crate::db::models::ConversionRule;
use crate::error::AppError;
use crate::modality::chat::ir::{IrChatRequest, IrChatResponse, IrStreamChunk};
use crate::modality::chat::{self, ChatFormat, Decoder, Encoder};
use crate::rules::engine;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Represents either a built-in codec or a JSONata-based rule.
#[derive(Clone)]
pub enum CodecProvider {
    Builtin(ChatFormat),
    Jsonata(Arc<ConversionRule>),
}

/// Central registry for all codec providers (built-in + user rules).
pub struct RuleRegistry {
    providers: RwLock<HashMap<String, CodecProvider>>,
}

impl RuleRegistry {
    pub fn new() -> Self {
        let mut map = HashMap::new();
        // Register built-in codecs with their slug identifiers
        map.insert("openai-chat".to_string(), CodecProvider::Builtin(ChatFormat::OpenaiChat));
        map.insert("openai".to_string(), CodecProvider::Builtin(ChatFormat::OpenaiChat));
        map.insert("openai-responses".to_string(), CodecProvider::Builtin(ChatFormat::OpenaiResponses));
        map.insert("anthropic".to_string(), CodecProvider::Builtin(ChatFormat::Anthropic));
        map.insert("gemini".to_string(), CodecProvider::Builtin(ChatFormat::Gemini));
        map.insert("moonshot".to_string(), CodecProvider::Builtin(ChatFormat::Moonshot));
        Self {
            providers: RwLock::new(map),
        }
    }

    /// Load all enabled user rules from the database and register them.
    pub async fn load_from_db(&self, db: &sqlx::SqlitePool) -> Result<(), AppError> {
        let rules = sqlx::query_as::<_, ConversionRule>(
            "SELECT * FROM conversion_rules WHERE enabled = 1 AND rule_type = 'user'",
        )
        .fetch_all(db)
        .await
        .map_err(AppError::Database)?;

        let mut providers = self.providers.write().await;
        for rule in rules {
            providers.insert(rule.slug.clone(), CodecProvider::Jsonata(Arc::new(rule)));
        }
        Ok(())
    }

    /// Look up a codec provider by slug.
    pub async fn get(&self, slug: &str) -> Option<CodecProvider> {
        self.providers.read().await.get(slug).cloned()
    }

    /// Register or update a single rule.
    pub async fn register_rule(&self, rule: ConversionRule) {
        let mut providers = self.providers.write().await;
        providers.insert(rule.slug.clone(), CodecProvider::Jsonata(Arc::new(rule)));
    }

    /// Remove a rule by slug (only if it's a Jsonata rule, not built-in).
    pub async fn remove_rule(&self, slug: &str) {
        let mut providers = self.providers.write().await;
        if let Some(CodecProvider::Jsonata(_)) = providers.get(slug) {
            providers.remove(slug);
        }
    }

    /// Reload all user rules from DB (call after bulk import, etc.).
    pub async fn reload_from_db(&self, db: &sqlx::SqlitePool) -> Result<(), AppError> {
        // Remove all Jsonata entries
        {
            let mut providers = self.providers.write().await;
            providers.retain(|_, v| matches!(v, CodecProvider::Builtin(_)));
        }
        // Reload
        self.load_from_db(db).await
    }
}

// --- JSONata-based Decoder/Encoder implementations ---

pub struct JsonataDecoder {
    pub rule: Arc<ConversionRule>,
}

impl Decoder for JsonataDecoder {
    fn decode_request(&self, body: &[u8]) -> Result<IrChatRequest, AppError> {
        let input: serde_json::Value = serde_json::from_slice(body)
            .map_err(|e| AppError::Codec(format!("Invalid JSON input: {}", e)))?;
        let ir_value = engine::evaluate(&self.rule.decode_request, &input)?;
        serde_json::from_value(ir_value)
            .map_err(|e| AppError::Codec(format!("JSONata output does not match IR schema: {}", e)))
    }

    fn decode_response(&self, body: &[u8]) -> Result<IrChatResponse, AppError> {
        let input: serde_json::Value = serde_json::from_slice(body)
            .map_err(|e| AppError::Codec(format!("Invalid JSON input: {}", e)))?;
        let ir_value = engine::evaluate(&self.rule.decode_response, &input)?;
        serde_json::from_value(ir_value)
            .map_err(|e| AppError::Codec(format!("JSONata output does not match IR schema: {}", e)))
    }

    fn decode_stream_chunk(&self, data: &str) -> Result<Option<IrStreamChunk>, AppError> {
        // Use dedicated stream template if available, otherwise fallback to decode_response
        let template = self.rule.decode_stream_chunk.as_deref()
            .unwrap_or(&self.rule.decode_response);

        let input: serde_json::Value = serde_json::from_str(data)
            .map_err(|e| AppError::Codec(format!("Invalid JSON in stream chunk: {}", e)))?;
        let ir_value = engine::evaluate(template, &input)?;
        let chunk: IrStreamChunk = serde_json::from_value(ir_value)
            .map_err(|e| AppError::Codec(format!("JSONata stream output does not match IR: {}", e)))?;
        Ok(Some(chunk))
    }

    fn is_stream_done(&self, data: &str) -> bool {
        data.trim() == "[DONE]"
    }
}

pub struct JsonataEncoder {
    pub rule: Arc<ConversionRule>,
}

impl Encoder for JsonataEncoder {
    fn encode_request(&self, ir: &IrChatRequest, model: &str) -> Result<Vec<u8>, AppError> {
        let mut ir_value = serde_json::to_value(ir)
            .map_err(|e| AppError::Codec(format!("IR serialize error: {}", e)))?;
        // Inject the actual model name
        if let Some(obj) = ir_value.as_object_mut() {
            obj.insert("model".to_string(), serde_json::Value::String(model.to_string()));
        }
        let output = engine::evaluate(&self.rule.encode_request, &ir_value)?;
        serde_json::to_vec(&output)
            .map_err(|e| AppError::Codec(format!("JSON serialize error: {}", e)))
    }

    fn encode_response(&self, ir: &IrChatResponse) -> Result<Vec<u8>, AppError> {
        let ir_value = serde_json::to_value(ir)
            .map_err(|e| AppError::Codec(format!("IR serialize error: {}", e)))?;
        let output = engine::evaluate(&self.rule.encode_response, &ir_value)?;
        serde_json::to_vec(&output)
            .map_err(|e| AppError::Codec(format!("JSON serialize error: {}", e)))
    }

    fn encode_stream_chunk(&self, chunk: &IrStreamChunk) -> Result<Option<String>, AppError> {
        let template = self.rule.encode_stream_chunk.as_deref()
            .unwrap_or(&self.rule.encode_response);

        let ir_value = serde_json::to_value(chunk)
            .map_err(|e| AppError::Codec(format!("IR serialize error: {}", e)))?;
        let output = engine::evaluate(template, &ir_value)?;
        let json_str = serde_json::to_string(&output)
            .map_err(|e| AppError::Codec(format!("JSON serialize error: {}", e)))?;
        Ok(Some(json_str))
    }

    fn stream_done_signal(&self) -> Option<String> {
        Some("[DONE]".to_string())
    }
}
```

**Step 2: Export `registry` from `rules/mod.rs`**

The `pub mod registry;` line should already be in `rules/mod.rs` from Task 5.

**Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors.

**Step 4: Commit**

```
feat(rules): add RuleRegistry with JSONata Decoder/Encoder
```

---

## Phase 4: Proxy Integration

### Task 7: Integrate RuleRegistry into the proxy pipeline

**Files:**
- Modify: `src-tauri/src/server/proxy.rs` (lines 16-20: ProxyState, lines 24-29: proxy_chat signature, lines 50-52, 76-83, 86-96, 149-153, 195-196)
- Modify: `src-tauri/src/server/router.rs` (lines 17-48: create_router, add RuleRegistry to state)
- Modify: `src-tauri/src/server/mod.rs` (line 13: pass registry)
- Modify: `src-tauri/src/lib.rs` (lines 79-90: create and store registry)

**Step 1: Add `RuleRegistry` to `ProxyState`**

In `src-tauri/src/server/proxy.rs`, modify `ProxyState` (lines 15-20):

```rust
use crate::rules::registry::{self, CodecProvider, RuleRegistry, JsonataDecoder, JsonataEncoder};

#[derive(Clone)]
pub struct ProxyState {
    pub db: SqlitePool,
    pub http_client: reqwest::Client,
    pub circuit: Arc<CircuitBreaker>,
    pub registry: Arc<RuleRegistry>,
}
```

**Step 2: Replace `chat::get_decoder`/`chat::get_encoder` calls with registry lookups**

Create a helper function in `proxy.rs`:

```rust
/// Resolve a codec slug to a Decoder via the registry.
async fn resolve_decoder(registry: &RuleRegistry, slug: &str) -> Result<Box<dyn chat::Decoder>, AppError> {
    match registry.get(slug).await {
        Some(CodecProvider::Builtin(format)) => Ok(chat::get_decoder(format)),
        Some(CodecProvider::Jsonata(rule)) => Ok(Box::new(JsonataDecoder { rule })),
        None => {
            // Fallback: try ChatFormat::from_str_loose for backward compat
            ChatFormat::from_str_loose(slug)
                .map(chat::get_decoder)
                .ok_or_else(|| AppError::Codec(format!("Unknown format: {}", slug)))
        }
    }
}

/// Resolve a codec slug to an Encoder via the registry.
async fn resolve_encoder(registry: &RuleRegistry, slug: &str) -> Result<Box<dyn chat::Encoder>, AppError> {
    match registry.get(slug).await {
        Some(CodecProvider::Builtin(format)) => Ok(chat::get_encoder(format)),
        Some(CodecProvider::Jsonata(rule)) => Ok(Box::new(JsonataEncoder { rule })),
        None => {
            ChatFormat::from_str_loose(slug)
                .map(chat::get_encoder)
                .ok_or_else(|| AppError::Codec(format!("Unknown format: {}", slug)))
        }
    }
}
```

**Step 3: Update `proxy_chat` to use registry**

Change the `input_format` parameter from `ChatFormat` to `String` (the slug), then use `resolve_decoder`/`resolve_encoder`:

Replace line 27 (`input_format: ChatFormat,`) with:
```rust
input_format_slug: &str,
```

Replace line 51-52:
```rust
// OLD: let decoder = chat::get_decoder(input_format);
let decoder = resolve_decoder(&state.registry, input_format_slug).await?;
```

Replace lines 54-59 (output format resolution):
```rust
let output_format_str = middleware::extract_output_format(&headers, None);
let output_slug = output_format_str
    .as_deref()
    .unwrap_or(input_format_slug);
```

Replace lines 76-83 (upstream format + encoding):
```rust
// The channel.provider now stores a rule slug
let upstream_slug = &channel.provider;
let upstream_encoder = resolve_encoder(&state.registry, upstream_slug).await?;
let upstream_body = upstream_encoder.encode_request(&ir, &mapping.actual_name)?;
```

Replace lines 86-96 (build URL and auth):
Use `HttpConfig` from the rule's `http_config` if the upstream is a JSONata rule, otherwise fall back to existing `build_upstream_url`/`apply_auth`:

```rust
let (upstream_url, req_builder) = build_upstream_request(
    &state, upstream_slug, &channel.base_url, &mapping.actual_name, ir.stream, api_key, upstream_body,
).await?;
```

Add a new helper:
```rust
async fn build_upstream_request(
    state: &ProxyState,
    upstream_slug: &str,
    base_url: &str,
    model: &str,
    stream: bool,
    api_key: &str,
    body: Vec<u8>,
) -> Result<(String, reqwest::RequestBuilder), AppError> {
    // Check if this is a JSONata rule with http_config
    if let Some(CodecProvider::Jsonata(rule)) = state.registry.get(upstream_slug).await {
        if let Some(http_config) = crate::rules::HttpConfig::parse(rule.http_config.as_deref()) {
            let url = http_config.url_template
                .replace("{{base_url}}", base_url.trim_end_matches('/'))
                .replace("{{model}}", model)
                .replace("{{stream_suffix}}", if stream { "?alt=sse" } else { "" });

            let mut builder = state.http_client
                .post(&url)
                .header("Content-Type", &http_config.content_type)
                .body(body);

            // Apply auth from template
            let auth_value = http_config.auth_header_template.replace("{{key}}", api_key);
            if http_config.auth_header_template.starts_with("Bearer") {
                builder = builder.header("Authorization", &auth_value);
            } else {
                // For custom auth headers, parse "header_name: value" or use as-is
                builder = builder.header("Authorization", &auth_value);
            }

            return Ok((url, builder));
        }
    }

    // Fallback to built-in URL/auth logic
    if let Some(format) = ChatFormat::from_str_loose(upstream_slug) {
        let url = build_upstream_url(base_url, format, model, stream);
        let mut builder = state.http_client
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body);
        builder = apply_auth(builder, format, api_key);
        Ok((url, builder))
    } else {
        Err(AppError::Codec(format!("Cannot build upstream request for unknown format: {}", upstream_slug)))
    }
}
```

**Step 4: Update `proxy_stream` to accept slug strings**

Change `proxy_stream` signature (line 188-194) to accept `&str` slugs instead of `ChatFormat`:

```rust
async fn proxy_stream(
    upstream_resp: reqwest::Response,
    upstream_slug: String,
    output_slug: String,
    registry: Arc<RuleRegistry>,
    db: SqlitePool,
    log_id: String,
) -> Result<Response, AppError> {
    let upstream_decoder = resolve_decoder(&registry, &upstream_slug).await?;
    let output_encoder = resolve_encoder(&registry, &output_slug).await?;
    // ... rest stays the same
```

**Step 5: Update router handler functions**

In `src-tauri/src/server/router.rs`, change the handlers (lines 83-105) to pass slug strings:

```rust
async fn handle_openai_chat(
    state: State<ProxyState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    proxy::proxy_chat(state, headers, "openai-chat", body).await
}

async fn handle_openai_responses(
    state: State<ProxyState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    proxy::proxy_chat(state, headers, "openai-responses", body).await
}

async fn handle_anthropic(
    state: State<ProxyState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    proxy::proxy_chat(state, headers, "anthropic", body).await
}
```

**Step 6: Create and initialize `RuleRegistry` in `router.rs` and `lib.rs`**

In `src-tauri/src/server/router.rs`, `create_router` (line 17):

```rust
pub async fn create_router(pool: SqlitePool) -> Router {
    let http_client = reqwest::Client::new();
    let circuit = Arc::new(CircuitBreaker::new(5, 60));

    let registry = Arc::new(RuleRegistry::new());
    // Load user-defined rules from DB
    if let Err(e) = registry.load_from_db(&pool).await {
        log::error!("Failed to load conversion rules: {}", e);
    }

    // ... rest unchanged, add registry to ProxyState
    let proxy_state = ProxyState {
        db: pool.clone(),
        http_client,
        circuit,
        registry,
    };
    // ...
```

Note: `create_router` becomes `async` — update the call in `server/mod.rs` accordingly:

In `src-tauri/src/server/mod.rs` line 13:
```rust
let app = router::create_router(pool).await;
```

**Step 7: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors. This is the most complex task — debug any compilation errors carefully.

**Step 8: Commit**

```
feat(proxy): integrate RuleRegistry for dual-track codec dispatch
```

---

### Task 8: Add rule validation and test Tauri command

**Files:**
- Modify: `src-tauri/src/commands/rules.rs`

**Step 1: Add validation command**

Append to `src-tauri/src/commands/rules.rs`:

```rust
/// Validate JSONata expressions without saving the rule.
#[tauri::command]
pub async fn validate_rule_templates(
    decode_request: String,
    encode_request: String,
    decode_response: String,
    encode_response: String,
    decode_stream_chunk: Option<String>,
    encode_stream_chunk: Option<String>,
) -> Result<(), IpcError> {
    let templates = [
        ("decode_request", &decode_request),
        ("encode_request", &encode_request),
        ("decode_response", &decode_response),
        ("encode_response", &encode_response),
    ];
    for (name, expr) in &templates {
        crate::rules::engine::validate(expr).map_err(|e| {
            IpcError::validation(&format!("{}: {}", name, e))
        })?;
    }
    if let Some(ref expr) = decode_stream_chunk {
        crate::rules::engine::validate(expr).map_err(|e| {
            IpcError::validation(&format!("decode_stream_chunk: {}", e))
        })?;
    }
    if let Some(ref expr) = encode_stream_chunk {
        crate::rules::engine::validate(expr).map_err(|e| {
            IpcError::validation(&format!("encode_stream_chunk: {}", e))
        })?;
    }
    Ok(())
}

/// Test a JSONata expression against sample input data.
#[tauri::command]
pub async fn test_rule_template(
    expression: String,
    input_json: String,
) -> Result<String, IpcError> {
    let input: serde_json::Value = serde_json::from_str(&input_json)
        .map_err(|e| IpcError::validation(&format!("Invalid input JSON: {}", e)))?;
    let result = crate::rules::engine::evaluate(&expression, &input)
        .map_err(|e| IpcError::validation(&format!("{}", e)))?;
    serde_json::to_string_pretty(&result)
        .map_err(|e| IpcError::internal(&format!("Serialize error: {}", e)))
}
```

**Step 2: Register in `lib.rs`**

Add to the `generate_handler![]` macro:

```rust
commands::rules::validate_rule_templates,
commands::rules::test_rule_template,
```

**Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

**Step 4: Commit**

```
feat(commands): add rule template validation and testing commands
```

---

## Phase 5: Frontend — Rules Management Page

### Task 9: Add Tauri IPC wrappers for rules

**Files:**
- Modify: `src/lib/tauri.ts`

**Step 1: Add TypeScript types and IPC functions**

Append to `src/lib/tauri.ts`:

```typescript
// --- Conversion Rules ---

export interface ConversionRule {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  author: string | null;
  version: string;
  tags: string | null;
  rule_type: string;
  modality: string;
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk: string | null;
  encode_stream_chunk: string | null;
  http_config: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function listConversionRules(): Promise<ConversionRule[]> {
  return invoke<ConversionRule[]>("list_conversion_rules");
}

export async function getConversionRule(id: string): Promise<ConversionRule> {
  return invoke<ConversionRule>("get_conversion_rule", { id });
}

export async function createConversionRule(params: {
  slug: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string;
  modality?: string;
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk?: string;
  encode_stream_chunk?: string;
  http_config?: string;
}): Promise<ConversionRule> {
  return invoke<ConversionRule>("create_conversion_rule", params);
}

export async function updateConversionRule(params: {
  id: string;
  slug: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string;
  modality?: string;
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk?: string;
  encode_stream_chunk?: string;
  http_config?: string;
  enabled: boolean;
}): Promise<void> {
  return invoke<void>("update_conversion_rule", params);
}

export async function deleteConversionRule(id: string): Promise<void> {
  return invoke<void>("delete_conversion_rule", { id });
}

export async function duplicateConversionRule(id: string): Promise<ConversionRule> {
  return invoke<ConversionRule>("duplicate_conversion_rule", { id });
}

export async function validateRuleTemplates(params: {
  decode_request: string;
  encode_request: string;
  decode_response: string;
  encode_response: string;
  decode_stream_chunk?: string;
  encode_stream_chunk?: string;
}): Promise<void> {
  return invoke<void>("validate_rule_templates", params);
}

export async function testRuleTemplate(
  expression: string,
  inputJson: string,
): Promise<string> {
  return invoke<string>("test_rule_template", {
    expression,
    input_json: inputJson,
  });
}
```

**Step 2: Commit**

```
feat(frontend): add Tauri IPC wrappers for conversion rules
```

---

### Task 10: Add i18n translations for rules

**Files:**
- Modify: `src/lib/i18n.tsx`

**Step 1: Add `rules` section to `Translations` interface**

Add after the `sidebar` section in the `Translations` interface:

```typescript
rules: {
  title: string;
  myRules: string;
  ruleStore: string;
  createRule: string;
  editRule: string;
  duplicateRule: string;
  deleteRule: string;
  importRule: string;
  exportRule: string;
  exportAll: string;
  slug: string;
  ruleType: string;
  system: string;
  user: string;
  modality: string;
  version: string;
  author: string;
  tags: string;
  templates: string;
  decodeRequest: string;
  encodeRequest: string;
  decodeResponse: string;
  encodeResponse: string;
  decodeStreamChunk: string;
  encodeStreamChunk: string;
  httpConfig: string;
  testPanel: string;
  testInput: string;
  testOutput: string;
  runTest: string;
  validate: string;
  validationSuccess: string;
  optional: string;
  required: string;
  systemRuleReadonly: string;
  confirmDelete: string;
  importSuccess: string;
  exportSuccess: string;
  slugConflict: string;
  overwrite: string;
  skip: string;
  importAsNew: string;
  install: string;
  update: string;
  installed: string;
};
```

Also add `rules: string;` to the `sidebar` section.

**Step 2: Add English translations**

Add to the `en` object:

```typescript
rules: {
  title: "Conversion Rules",
  myRules: "My Rules",
  ruleStore: "Rule Store",
  createRule: "Create Rule",
  editRule: "Edit Rule",
  duplicateRule: "Duplicate",
  deleteRule: "Delete Rule",
  importRule: "Import",
  exportRule: "Export",
  exportAll: "Export All",
  slug: "Slug",
  ruleType: "Type",
  system: "System",
  user: "User",
  modality: "Modality",
  version: "Version",
  author: "Author",
  tags: "Tags",
  templates: "Templates",
  decodeRequest: "Decode Request",
  encodeRequest: "Encode Request",
  decodeResponse: "Decode Response",
  encodeResponse: "Encode Response",
  decodeStreamChunk: "Decode Stream Chunk",
  encodeStreamChunk: "Encode Stream Chunk",
  httpConfig: "HTTP Config",
  testPanel: "Test Panel",
  testInput: "Input JSON",
  testOutput: "Output",
  runTest: "Run Test",
  validate: "Validate",
  validationSuccess: "All templates are valid",
  optional: "Optional",
  required: "Required",
  systemRuleReadonly: "System rules are read-only",
  confirmDelete: "Are you sure you want to delete this rule?",
  importSuccess: "Rule imported successfully",
  exportSuccess: "Rule exported successfully",
  slugConflict: "A rule with this slug already exists",
  overwrite: "Overwrite",
  skip: "Skip",
  importAsNew: "Import as New",
  install: "Install",
  update: "Update",
  installed: "Installed",
},
```

Also add `rules: "Rules"` to `sidebar` in `en`.

**Step 3: Add Chinese translations**

Add corresponding `zh` translations following the same structure.

**Step 4: Commit**

```
feat(i18n): add conversion rules translations
```

---

### Task 11: Create Rules page component

**Files:**
- Create: `src/pages/Rules.tsx`
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/layout/Sidebar.tsx` (add nav item)

**Step 1: Create the Rules page**

Create `src/pages/Rules.tsx` with two tabs ("My Rules" and "Rule Store"), a data table for listing rules, and basic CRUD actions (create, edit, duplicate, delete). Use the same patterns as `src/pages/Channels.tsx` — DataTable, Dialog for create/edit, import/export buttons.

This is the largest frontend task. Key elements:

- **Tabs component** for "My Rules" / "Rule Store"
- **DataTable** with columns: name, slug, type (system/user badge), modality, version, enabled toggle, actions
- **Create/Edit dialog**: left panel for metadata (name, slug, description, tags, http_config), right panel for JSONata template editors (textarea initially — code editor in a follow-up)
- **Import button**: file input accepting `.omnikit.json` and `.zip`
- **Export button**: per-rule and bulk export
- **Delete with confirmation**
- **Duplicate action** for system rules ("copy to user rule")

Follow the exact component patterns from `Channels.tsx` (Dialog, Select, Input, Button, toast notifications).

**Step 2: Add route to `App.tsx`**

Add import and route:

```tsx
import Rules from "@/pages/Rules";
// Inside Routes:
<Route path="rules" element={<Rules />} />
```

**Step 3: Add sidebar nav item**

In `src/components/layout/Sidebar.tsx`, add to `navItems` array (after channels, before model-mappings):

```typescript
{ to: "/rules", icon: FileCode2, label: t.sidebar.rules },
```

Import `FileCode2` from `lucide-react`.

**Step 4: Verify frontend builds**

Run: `npm run build` (from project root)
Expected: No build errors.

**Step 5: Commit**

```
feat(frontend): add conversion rules management page
```

---

### Task 12: Add rule editor with JSONata template editing

**Files:**
- Modify: `src/pages/Rules.tsx` (enhance create/edit dialog)

**Step 1: Install a code editor component**

Run: `npm install @uiw/react-textarea-code-editor`

This is a lightweight code editor with syntax highlighting. It's simpler than Monaco but sufficient for JSONata editing. (Monaco can be added later if needed.)

**Step 2: Build the rule editor dialog**

Enhance the create/edit dialog in `Rules.tsx`:

- Left panel: form fields (name, slug, description, author, version, tags as comma-separated, http_config as JSON textarea)
- Right panel: 6 template editors in an accordion/tab layout
  - 4 required templates with "*" marker
  - 2 optional templates (stream) collapsed by default
- Bottom: test panel
  - Input JSON textarea
  - "Run Test" button (calls `testRuleTemplate`)
  - Output display area
  - "Validate All" button (calls `validateRuleTemplates`)

**Step 3: Verify frontend builds**

Run: `npm run build`

**Step 4: Commit**

```
feat(frontend): add rule editor with template editing and test panel
```

---

### Task 13: Add rule import/export functionality

**Files:**
- Modify: `src/pages/Rules.tsx`

**Step 1: Implement single-rule export**

Add an export function that serializes a rule to the `.omnikit.json` format and triggers a file download:

```typescript
function exportRule(rule: ConversionRule) {
  const exportData = {
    "omnikit_rule": "1.0",
    slug: rule.slug,
    name: rule.name,
    description: rule.description,
    author: rule.author,
    version: rule.version,
    tags: rule.tags ? JSON.parse(rule.tags) : [],
    modality: rule.modality,
    templates: {
      decode_request: rule.decode_request,
      encode_request: rule.encode_request,
      decode_response: rule.decode_response,
      encode_response: rule.encode_response,
      decode_stream_chunk: rule.decode_stream_chunk,
      encode_stream_chunk: rule.encode_stream_chunk,
    },
    http_config: rule.http_config ? JSON.parse(rule.http_config) : null,
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${rule.slug}.omnikit.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Step 2: Implement single-rule import**

Add a file input handler that reads `.omnikit.json` files, parses them, validates the structure, and calls `createConversionRule`. Handle slug conflicts with a dialog offering overwrite/skip/import-as-new options.

**Step 3: Implement bulk export (ZIP)**

Use the `jszip` library:

Run: `npm install jszip`

```typescript
async function exportAllRules(rules: ConversionRule[]) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folder = zip.folder("rules")!;
  for (const rule of rules.filter(r => r.rule_type === "user")) {
    const data = { /* same format as single export */ };
    folder.file(`${rule.slug}.omnikit.json`, JSON.stringify(data, null, 2));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  // trigger download
}
```

**Step 4: Implement ZIP import**

Read ZIP file, iterate entries, parse each `.omnikit.json` file, import each rule.

**Step 5: Commit**

```
feat(frontend): add rule import/export (JSON and ZIP)
```

---

## Phase 6: Channel Integration

### Task 14: Update Channels page to use rule selector

**Files:**
- Modify: `src/pages/Channels.tsx` (lines 97-112: PROVIDERS, lines 663-687: provider select)

**Step 1: Replace hardcoded PROVIDERS with dynamic rule list**

In `Channels.tsx`, replace the static `PROVIDERS` array with a dynamic list fetched from the backend. On component mount, call `listConversionRules()` and use the results to populate the provider dropdown.

Replace lines 97-112:

```typescript
// Remove static PROVIDERS constant
// Instead, load rules dynamically:
const [conversionRules, setConversionRules] = useState<ConversionRule[]>([]);

useEffect(() => {
  listConversionRules().then(setConversionRules).catch(console.error);
}, []);
```

**Step 2: Update the provider select dropdown**

Replace the hardcoded `<Select>` (lines 663-687) with:

```tsx
<Select
  value={formData.provider}
  onValueChange={(val) => {
    setFormData(prev => ({ ...prev, provider: val, base_url: "" }));
  }}
>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {conversionRules.filter(r => r.enabled).map(rule => (
      <SelectItem key={rule.slug} value={rule.slug}>
        {rule.name}
        {rule.rule_type === "system" && (
          <span className="ml-2 text-xs text-muted-foreground">(Built-in)</span>
        )}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Step 3: Update `PROVIDER_DEFAULT_URLS`**

Replace with dynamic lookup from the rule's `http_config`:

```typescript
function getDefaultUrl(slug: string): string {
  const rule = conversionRules.find(r => r.slug === slug);
  if (rule?.http_config) {
    try {
      const config = JSON.parse(rule.http_config);
      if (config.url_template) return config.url_template.split("/v1")[0] || "";
    } catch {}
  }
  // Fallback for built-in
  const defaults: Record<string, string> = {
    "openai-chat": "https://api.openai.com",
    "anthropic": "https://api.anthropic.com",
    "gemini": "https://generativelanguage.googleapis.com",
    "moonshot": "https://api.moonshot.cn",
  };
  return defaults[slug] || "";
}
```

**Step 4: Verify frontend builds**

Run: `npm run build`

**Step 5: Commit**

```
feat(frontend): update Channels page to use dynamic rule selector
```

---

## Phase 7: System Rule Seeding

### Task 15: Seed system rules on first startup

**Files:**
- Modify: `src-tauri/src/lib.rs` (after DB initialization, before server start)

**Step 1: Create a seeding function**

Add to `src-tauri/src/rules/mod.rs`:

```rust
/// Seed the built-in system rules into the database if they don't exist yet.
/// On upgrade, update existing system rules' templates.
pub async fn seed_system_rules(db: &sqlx::SqlitePool) -> Result<(), crate::error::AppError> {
    let system_rules = vec![
        ("openai-chat", "OpenAI Chat Completions", "Built-in OpenAI Chat Completions codec"),
        ("openai-responses", "OpenAI Responses", "Built-in OpenAI Responses codec"),
        ("anthropic", "Anthropic Messages", "Built-in Anthropic Messages codec"),
        ("gemini", "Gemini", "Built-in Google Gemini codec"),
        ("moonshot", "Moonshot (Kimi)", "Built-in Moonshot codec"),
    ];

    let now = chrono::Utc::now().to_rfc3339();

    for (slug, name, desc) in system_rules {
        let exists = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM conversion_rules WHERE slug = ?",
        )
        .bind(slug)
        .fetch_one(db)
        .await
        .unwrap_or(0);

        if exists == 0 {
            let id = uuid::Uuid::new_v4().to_string();
            // System rules use empty JSONata templates — they dispatch to built-in codecs
            sqlx::query(
                "INSERT INTO conversion_rules (id, slug, name, description, rule_type, modality, decode_request, encode_request, decode_response, encode_response, http_config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 'system', 'chat', '', '', '', '', NULL, 1, ?, ?)"
            )
            .bind(&id).bind(slug).bind(name).bind(desc)
            .bind(&now).bind(&now)
            .execute(db)
            .await
            .map_err(crate::error::AppError::Database)?;
        }
    }

    Ok(())
}
```

**Step 2: Call the seeding function in `lib.rs`**

In `src-tauri/src/lib.rs`, after the DB pool is initialized (after line 72), add:

```rust
if let Err(e) = rules::seed_system_rules(&pool).await {
    log::error!("Failed to seed system rules: {}", e);
}
```

**Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`

**Step 4: Commit**

```
feat(rules): seed built-in system rules on first startup
```

---

## Phase 8: Rule Store (Remote Repository)

### Task 16: Create `rules/repository.rs` for remote index fetching

**Files:**
- Create: `src-tauri/src/rules/repository.rs`
- Modify: `src-tauri/src/rules/mod.rs` (add `pub mod repository;`)

**Step 1: Implement index fetching**

```rust
use serde::{Deserialize, Serialize};

const INDEX_URL: &str = "https://raw.githubusercontent.com/<org>/omnikit-rules/main/index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleIndexEntry {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub tags: Vec<String>,
    pub modality: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleIndex {
    pub rules: Vec<RuleIndexEntry>,
}

/// Fetch the remote rule index. Returns None if fetch fails (offline mode).
pub async fn fetch_index() -> Option<RuleIndex> {
    let client = reqwest::Client::new();
    let resp = client
        .get(INDEX_URL)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .ok()?;
    resp.json::<RuleIndex>().await.ok()
}

/// Fetch a single rule file from the remote repository.
pub async fn fetch_rule(slug: &str) -> Option<serde_json::Value> {
    let url = format!(
        "https://raw.githubusercontent.com/<org>/omnikit-rules/main/{}.omnikit.json",
        slug
    );
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .ok()?;
    resp.json::<serde_json::Value>().await.ok()
}
```

**Step 2: Add Tauri commands for the rule store**

Add to `src-tauri/src/commands/rules.rs`:

```rust
#[tauri::command]
pub async fn fetch_rule_store_index() -> Result<serde_json::Value, IpcError> {
    match crate::rules::repository::fetch_index().await {
        Some(index) => serde_json::to_value(index)
            .map_err(|e| IpcError::internal(&e.to_string())),
        None => Ok(serde_json::json!({ "rules": [] })),
    }
}

#[tauri::command]
pub async fn install_rule_from_store(
    state: State<'_, AppState>,
    slug: String,
) -> Result<ConversionRule, IpcError> {
    let rule_data = crate::rules::repository::fetch_rule(&slug)
        .await
        .ok_or_else(|| IpcError::internal("Failed to fetch rule from store"))?;

    // Parse and insert into DB
    // ... (parse the .omnikit.json format, create in DB)
    todo!("Parse rule_data and insert — follow the import format from design doc")
}
```

Register these commands in `lib.rs`.

**Step 3: Add frontend "Rule Store" tab**

Implement the "Rule Store" tab in `Rules.tsx` using card layout, tag filtering, and install/update buttons. Calls `fetch_rule_store_index` on tab switch.

**Step 4: Commit**

```
feat(rules): add remote rule store index fetching and install
```

---

## Implementation Notes

### JSONata `jsonata-rs` API Considerations

The `jsonata-rs` crate uses `bumpalo` arenas. If the API has changed since this plan was written, check:
- [docs.rs/jsonata-rs](https://docs.rs/jsonata-rs) for the current API
- The evaluate function might require different argument types

If `jsonata-rs` proves too unstable, the fallback is to use `boa_engine` (Rust JS engine) with the official JSONata JS library bundled. This would require:
1. Add `boa_engine` dependency
2. Bundle `jsonata.min.js` as a resource
3. Create a JS runtime per evaluation that loads JSONata and runs the expression

### Database Migration Notes

SQLx migrations run automatically on app startup. The new `005_conversion_rules.sql` will be executed the first time the app starts after the update.

### Backward Compatibility

The `Channel.provider` field currently stores values like `"openai"`, `"anthropic"`. After migration:
- System rules are seeded with matching slugs: `"openai-chat"` (note: `"openai"` also registered as alias in `RuleRegistry`)
- Existing channels with `provider = "openai"` will still work because `RuleRegistry::new()` registers `"openai"` as an alias to `ChatFormat::OpenaiChat`
- No data migration needed for existing channels

### Testing Strategy

- **Rust unit tests**: Test `rules::engine::evaluate` with sample JSONata expressions and JSON inputs
- **Rust integration test**: Test `JsonataDecoder`/`JsonataEncoder` with a simple rule against known IR inputs/outputs
- **Frontend**: Manual testing via the rule editor's test panel
