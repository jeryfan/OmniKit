use crate::db::models::{Channel, ConversionRule};
use crate::error::IpcError;
use crate::AppState;
use serde::Serialize;
use tauri::State;

#[tauri::command]
pub async fn list_conversion_rules(
    state: State<'_, AppState>,
) -> Result<Vec<ConversionRule>, IpcError> {
    Ok(
        sqlx::query_as::<_, ConversionRule>(
            "SELECT * FROM conversion_rules ORDER BY rule_type ASC, name ASC",
        )
        .fetch_all(&state.db)
        .await?,
    )
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
        .ok_or_else(|| IpcError::not_found("Conversion rule not found"))
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
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let version = version.unwrap_or_else(|| "1.0.0".to_string());
    let modality = modality.unwrap_or_else(|| "chat".to_string());

    sqlx::query(
        "INSERT INTO conversion_rules (id, slug, name, description, author, version, tags, rule_type, modality, decode_request, encode_request, decode_response, encode_response, decode_stream_chunk, encode_stream_chunk, http_config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    )
    .bind(&id)
    .bind(&slug)
    .bind(&name)
    .bind(&description)
    .bind(&author)
    .bind(&version)
    .bind(&tags)
    .bind(&modality)
    .bind(&decode_request)
    .bind(&encode_request)
    .bind(&decode_response)
    .bind(&encode_response)
    .bind(&decode_stream_chunk)
    .bind(&encode_stream_chunk)
    .bind(&http_config)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(
        sqlx::query_as::<_, ConversionRule>("SELECT * FROM conversion_rules WHERE id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await?,
    )
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
    let existing =
        sqlx::query_as::<_, ConversionRule>("SELECT * FROM conversion_rules WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| IpcError::not_found("Conversion rule not found"))?;

    if existing.rule_type == "system" {
        return Err(IpcError::validation("Cannot modify system conversion rules"));
    }

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE conversion_rules SET slug = ?, name = ?, description = ?, author = ?, version = ?, tags = ?, modality = ?, decode_request = ?, encode_request = ?, decode_response = ?, encode_response = ?, decode_stream_chunk = ?, encode_stream_chunk = ?, http_config = ?, enabled = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&slug)
    .bind(&name)
    .bind(&description)
    .bind(&author)
    .bind(&version)
    .bind(&tags)
    .bind(&modality)
    .bind(&decode_request)
    .bind(&encode_request)
    .bind(&decode_response)
    .bind(&encode_response)
    .bind(&decode_stream_chunk)
    .bind(&encode_stream_chunk)
    .bind(&http_config)
    .bind(enabled)
    .bind(&now)
    .bind(&id)
    .execute(&state.db)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn delete_conversion_rule(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), IpcError> {
    let existing =
        sqlx::query_as::<_, ConversionRule>("SELECT * FROM conversion_rules WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| IpcError::not_found("Conversion rule not found"))?;

    if existing.rule_type == "system" {
        return Err(IpcError::validation("Cannot delete system conversion rules"));
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
    let source =
        sqlx::query_as::<_, ConversionRule>("SELECT * FROM conversion_rules WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| IpcError::not_found("Conversion rule not found"))?;

    let new_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let new_slug = format!("{}-copy", source.slug);
    let new_name = format!("{} (Copy)", source.name);

    sqlx::query(
        "INSERT INTO conversion_rules (id, slug, name, description, author, version, tags, rule_type, modality, decode_request, encode_request, decode_response, encode_response, decode_stream_chunk, encode_stream_chunk, http_config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    )
    .bind(&new_id)
    .bind(&new_slug)
    .bind(&new_name)
    .bind(&source.description)
    .bind(&source.author)
    .bind(&source.version)
    .bind(&source.tags)
    .bind(&source.modality)
    .bind(&source.decode_request)
    .bind(&source.encode_request)
    .bind(&source.decode_response)
    .bind(&source.encode_response)
    .bind(&source.decode_stream_chunk)
    .bind(&source.encode_stream_chunk)
    .bind(&source.http_config)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(
        sqlx::query_as::<_, ConversionRule>("SELECT * FROM conversion_rules WHERE id = ?")
            .bind(&new_id)
            .fetch_one(&state.db)
            .await?,
    )
}

// ---------------------------------------------------------------------------
// AI-assisted rule generation
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct GeneratedRule {
    pub name: String,
    pub slug: String,
    pub description: String,
    pub decode_request: String,
    pub encode_request: String,
    pub decode_response: String,
    pub encode_response: String,
    pub decode_stream_chunk: String,
    pub encode_stream_chunk: String,
    pub http_config: String,
}

const AI_SYSTEM_PROMPT: &str = r#"You are an expert at writing JSONata expressions for OmniKit, an LLM API gateway that converts between different LLM provider API formats.

OmniKit uses an intermediate representation (IR) for chat. The IR structures are:

**IrChatRequest** (decode_request output / encode_request input):
```json
{
  "model": "string",
  "messages": [{"role": "system|user|assistant|tool", "content": "string or parts array", "tool_calls": [...], "tool_call_id": "..."}],
  "system": "optional string",
  "temperature": 0.7,
  "top_p": 1.0,
  "max_tokens": 4096,
  "stream": false,
  "stop": ["..."],
  "tools": [{"name": "...", "description": "...", "parameters": {...}}],
  "tool_choice": "auto|none|any|{name: ...}"
}
```

**IrChatResponse** (decode_response output / encode_response input):
```json
{
  "id": "string",
  "model": "string",
  "message": {"role": "assistant", "content": "string", "tool_calls": [...]},
  "finish_reason": "stop|length|tool_calls|content_filter",
  "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
}
```

**IrStreamChunk** (decode_stream_chunk output / encode_stream_chunk input):
```json
{
  "id": "string",
  "model": "string",
  "delta_role": "assistant",
  "delta_content": "string",
  "delta_tool_calls": [{"index": 0, "id": "...", "name": "...", "arguments": "..."}],
  "finish_reason": "stop|length|tool_calls|content_filter",
  "usage": {"prompt_tokens": 0, "completion_tokens": 0}
}
```

Each conversion rule has 6 JSONata templates:
- **decode_request**: Provider request JSON → IR request
- **encode_request**: IR request → Provider request JSON
- **decode_response**: Provider response JSON → IR response
- **encode_response**: IR response → Provider response JSON
- **decode_stream_chunk**: Provider SSE chunk → IR stream chunk
- **encode_stream_chunk**: IR stream chunk → Provider SSE chunk

And optionally:
- **http_config**: JSON object with `auth_header_template`, `url_template`, `content_type` fields

The input `$` in each JSONata expression is the source JSON object. Write valid JSONata expressions.

You MUST respond with a JSON object (no markdown, no code fences) with these exact keys:
{
  "name": "Human-readable rule name",
  "slug": "kebab-case-slug",
  "description": "Brief description",
  "decode_request": "JSONata expression",
  "encode_request": "JSONata expression",
  "decode_response": "JSONata expression",
  "encode_response": "JSONata expression",
  "decode_stream_chunk": "JSONata expression",
  "encode_stream_chunk": "JSONata expression",
  "http_config": "{} or JSON string"
}
"#;

#[tauri::command]
pub async fn generate_rule_with_ai(
    state: State<'_, AppState>,
    channel_id: String,
    model: String,
    prompt: String,
) -> Result<GeneratedRule, IpcError> {
    // Fetch channel
    let channel = sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = ?")
        .bind(&channel_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| IpcError::not_found("Channel not found"))?;

    // Fetch first enabled API key
    let api_key = sqlx::query_scalar::<_, String>(
        "SELECT key_value FROM channel_api_keys WHERE channel_id = ? AND enabled = 1 LIMIT 1",
    )
    .bind(&channel_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| IpcError::validation("No API key configured for this channel"))?;

    // Build request to send to the channel using OpenAI Chat Completions format
    let base_url = channel.base_url.trim_end_matches('/');
    let url = format!("{}/v1/chat/completions", base_url);

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": AI_SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"}
    });

    // Build headers based on provider
    let client = reqwest::Client::new();
    let mut req = client.post(&url).json(&body);

    match channel.provider.as_str() {
        "anthropic" => {
            req = req
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01");
        }
        "gemini" => {
            req = req.header("x-goog-api-key", &api_key);
        }
        _ => {
            req = req.header("Authorization", format!("Bearer {}", api_key));
        }
    }

    let resp = req.send().await.map_err(|e| {
        IpcError::internal(&format!("Failed to call AI: {}", e))
    })?;

    let status = resp.status();
    let resp_text = resp.text().await.map_err(|e| {
        IpcError::internal(&format!("Failed to read AI response: {}", e))
    })?;

    if !status.is_success() {
        return Err(IpcError::internal(&format!(
            "AI returned status {}: {}",
            status.as_u16(),
            resp_text
        )));
    }

    // Parse response — extract content from OpenAI-format response
    let resp_json: serde_json::Value = serde_json::from_str(&resp_text)
        .map_err(|e| IpcError::internal(&format!("Invalid AI response JSON: {}", e)))?;

    let content = resp_json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| IpcError::internal("AI response missing content"))?;

    // Parse the generated rule JSON
    let rule: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| IpcError::internal(&format!("AI returned invalid JSON: {}", e)))?;

    Ok(GeneratedRule {
        name: rule["name"].as_str().unwrap_or("").to_string(),
        slug: rule["slug"].as_str().unwrap_or("").to_string(),
        description: rule["description"].as_str().unwrap_or("").to_string(),
        decode_request: rule["decode_request"].as_str().unwrap_or("").to_string(),
        encode_request: rule["encode_request"].as_str().unwrap_or("").to_string(),
        decode_response: rule["decode_response"].as_str().unwrap_or("").to_string(),
        encode_response: rule["encode_response"].as_str().unwrap_or("").to_string(),
        decode_stream_chunk: rule["decode_stream_chunk"].as_str().unwrap_or("").to_string(),
        encode_stream_chunk: rule["encode_stream_chunk"].as_str().unwrap_or("").to_string(),
        http_config: rule["http_config"].as_str().unwrap_or("").to_string(),
    })
}

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
    let required = [
        ("decode_request", &decode_request),
        ("encode_request", &encode_request),
        ("decode_response", &decode_response),
        ("encode_response", &encode_response),
    ];
    for (name, expr) in &required {
        crate::rules::engine::validate(expr)
            .map_err(|e| IpcError::validation(&format!("{}: {}", name, e)))?;
    }
    if let Some(ref expr) = decode_stream_chunk {
        crate::rules::engine::validate(expr)
            .map_err(|e| IpcError::validation(&format!("decode_stream_chunk: {}", e)))?;
    }
    if let Some(ref expr) = encode_stream_chunk {
        crate::rules::engine::validate(expr)
            .map_err(|e| IpcError::validation(&format!("encode_stream_chunk: {}", e)))?;
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

    // Parse the .omnikit.json format
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let rule_slug = rule_data["slug"].as_str().unwrap_or(&slug).to_string();
    let name = rule_data["name"].as_str().unwrap_or(&slug).to_string();
    let description = rule_data["description"].as_str().map(|s| s.to_string());
    let author = rule_data["author"].as_str().map(|s| s.to_string());
    let version = rule_data["version"].as_str().unwrap_or("1.0.0").to_string();
    let tags = rule_data.get("tags").map(|v| v.to_string());
    let modality = rule_data["modality"].as_str().unwrap_or("chat").to_string();
    let decode_request = rule_data["decode_request"].as_str().unwrap_or("").to_string();
    let encode_request = rule_data["encode_request"].as_str().unwrap_or("").to_string();
    let decode_response = rule_data["decode_response"].as_str().unwrap_or("").to_string();
    let encode_response = rule_data["encode_response"].as_str().unwrap_or("").to_string();
    let decode_stream_chunk = rule_data["decode_stream_chunk"].as_str().map(|s| s.to_string());
    let encode_stream_chunk = rule_data["encode_stream_chunk"].as_str().map(|s| s.to_string());
    let http_config = rule_data.get("http_config").map(|v| v.to_string());

    sqlx::query(
        "INSERT INTO conversion_rules (id, slug, name, description, author, version, tags, rule_type, modality, decode_request, encode_request, decode_response, encode_response, decode_stream_chunk, encode_stream_chunk, http_config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    )
    .bind(&id).bind(&rule_slug).bind(&name).bind(&description)
    .bind(&author).bind(&version).bind(&tags)
    .bind(&modality)
    .bind(&decode_request).bind(&encode_request)
    .bind(&decode_response).bind(&encode_response)
    .bind(&decode_stream_chunk).bind(&encode_stream_chunk)
    .bind(&http_config)
    .bind(&now).bind(&now)
    .execute(&state.db)
    .await?;

    Ok(
        sqlx::query_as::<_, ConversionRule>("SELECT * FROM conversion_rules WHERE id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await?,
    )
}
