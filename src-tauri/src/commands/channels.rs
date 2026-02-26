use crate::db::models::{Channel, ChannelApiKey};
use crate::error::IpcError;
use crate::rules;
use crate::AppState;
use tauri::State;

fn validate_provider(provider: &str) -> Result<(), IpcError> {
    if rules::is_system_rule_slug(provider) {
        Ok(())
    } else {
        Err(IpcError::validation("Unsupported provider"))
    }
}

#[tauri::command]
pub async fn list_channels(state: State<'_, AppState>) -> Result<Vec<Channel>, IpcError> {
    Ok(
        sqlx::query_as::<_, Channel>("SELECT * FROM channels ORDER BY priority ASC, name ASC")
            .fetch_all(&state.db)
            .await?,
    )
}

#[tauri::command]
pub async fn create_channel(
    state: State<'_, AppState>,
    name: String,
    provider: String,
    base_url: String,
    priority: i32,
    weight: i32,
) -> Result<Channel, IpcError> {
    validate_provider(&provider)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO channels (id, name, provider, base_url, priority, weight, enabled, key_rotation, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)"
    )
    .bind(&id).bind(&name).bind(&provider).bind(&base_url)
    .bind(priority).bind(weight).bind(&now).bind(&now)
    .execute(&state.db)
    .await?;

    Ok(
        sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await?,
    )
}

#[tauri::command]
pub async fn update_channel(
    state: State<'_, AppState>,
    id: String,
    name: String,
    provider: String,
    base_url: String,
    priority: i32,
    weight: i32,
    enabled: bool,
    key_rotation: bool,
) -> Result<(), IpcError> {
    validate_provider(&provider)?;

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE channels SET name = ?, provider = ?, base_url = ?, priority = ?, weight = ?, enabled = ?, key_rotation = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&name).bind(&provider).bind(&base_url)
    .bind(priority).bind(weight).bind(enabled).bind(key_rotation)
    .bind(&now).bind(&id)
    .execute(&state.db)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_channel(state: State<'_, AppState>, id: String) -> Result<(), IpcError> {
    sqlx::query("DELETE FROM channels WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn list_channel_api_keys(
    state: State<'_, AppState>,
    channel_id: String,
) -> Result<Vec<ChannelApiKey>, IpcError> {
    Ok(
        sqlx::query_as::<_, ChannelApiKey>("SELECT * FROM channel_api_keys WHERE channel_id = ?")
            .bind(&channel_id)
            .fetch_all(&state.db)
            .await?,
    )
}

#[tauri::command]
pub async fn add_channel_api_key(
    state: State<'_, AppState>,
    channel_id: String,
    key_value: String,
) -> Result<ChannelApiKey, IpcError> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO channel_api_keys (id, channel_id, key_value, enabled) VALUES (?, ?, ?, 1)",
    )
    .bind(&id)
    .bind(&channel_id)
    .bind(&key_value)
    .execute(&state.db)
    .await?;

    Ok(
        sqlx::query_as::<_, ChannelApiKey>("SELECT * FROM channel_api_keys WHERE id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await?,
    )
}

#[tauri::command]
pub async fn delete_channel_api_key(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), IpcError> {
    sqlx::query("DELETE FROM channel_api_keys WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_channel_api_key(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<(), IpcError> {
    sqlx::query("UPDATE channel_api_keys SET enabled = ? WHERE id = ?")
        .bind(enabled)
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}

/// Mask an API key for display: show first 4 + last 4 characters.
fn mask_api_key(key: &str) -> String {
    let len = key.len();
    if len <= 8 {
        return "*".repeat(len);
    }
    format!("{}****{}", &key[..4], &key[len - 4..])
}

/// Build default header templates based on provider type.
fn default_header_templates(provider: &str) -> std::collections::HashMap<String, String> {
    let mut templates = std::collections::HashMap::new();
    match provider {
        "anthropic" => {
            templates.insert("x-api-key".to_string(), "{{api_key}}".to_string());
            templates.insert("anthropic-version".to_string(), "2023-06-01".to_string());
        }
        "gemini" => {
            templates.insert("x-goog-api-key".to_string(), "{{api_key}}".to_string());
        }
        _ => {
            templates.insert(
                "Authorization".to_string(),
                "Bearer {{api_key}}".to_string(),
            );
        }
    }
    templates
}

/// Resolve `{{api_key}}` in a header value, returning (actual_value, masked_value).
fn resolve_template_value(template: &str, api_key: Option<&str>) -> (String, String) {
    match api_key {
        Some(key) => {
            let actual = template.replace("{{api_key}}", key);
            let masked = template.replace("{{api_key}}", &mask_api_key(key));
            (actual, masked)
        }
        None => (template.to_string(), template.to_string()),
    }
}

/// Send an HTTP request and build the JSON result.
async fn send_test_request(
    method: &str,
    url: &str,
    header_templates: &std::collections::HashMap<String, String>,
    api_key: Option<&str>,
) -> serde_json::Value {
    let client = reqwest::Client::new();
    let mut req = match method {
        "POST" => client.post(url),
        _ => client.get(url),
    };

    let mut masked_headers = serde_json::Map::new();
    let mut templates_json = serde_json::Map::new();

    for (k, v) in header_templates {
        let (actual, masked) = resolve_template_value(v, api_key);
        req = req.header(k.as_str(), &actual);
        masked_headers.insert(k.clone(), serde_json::Value::String(masked));
        templates_json.insert(k.clone(), serde_json::Value::String(v.clone()));
    }

    let request_info = serde_json::json!({
        "method": method,
        "url": url,
        "headers": masked_headers,
        "header_templates": templates_json,
    });

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let mut resp_headers = serde_json::Map::new();
            for (name, value) in resp.headers().iter() {
                if let Ok(v) = value.to_str() {
                    resp_headers.insert(
                        name.as_str().to_string(),
                        serde_json::Value::String(v.to_string()),
                    );
                }
            }
            let body = resp.text().await.unwrap_or_default();
            serde_json::json!({
                "success": status >= 200 && status < 300,
                "request": request_info,
                "response": {
                    "status": status,
                    "headers": resp_headers,
                    "body": body,
                },
            })
        }
        Err(e) => serde_json::json!({
            "success": false,
            "request": request_info,
            "error": e.to_string(),
        }),
    }
}

/// Fetch the first enabled API key for a channel.
async fn fetch_api_key(
    db: &sqlx::SqlitePool,
    channel_id: &str,
) -> Result<Option<String>, IpcError> {
    Ok(sqlx::query_scalar::<_, String>(
        "SELECT key_value FROM channel_api_keys WHERE channel_id = ? AND enabled = 1 LIMIT 1",
    )
    .bind(channel_id)
    .fetch_optional(db)
    .await?)
}

#[tauri::command]
pub async fn test_channel(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, IpcError> {
    let channel = sqlx::query_as::<_, Channel>("SELECT * FROM channels WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| IpcError::not_found("Channel not found"))?;

    let api_key = fetch_api_key(&state.db, &id).await?;
    let base_url = channel.base_url.trim_end_matches('/');

    // Use saved config or generate defaults from provider
    let (test_url, header_templates) =
        if channel.test_url.is_some() || channel.test_headers.is_some() {
            let url = channel
                .test_url
                .clone()
                .unwrap_or_else(|| format!("{}/v1/models", base_url));
            let templates: std::collections::HashMap<String, String> = channel
                .test_headers
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();
            (url, templates)
        } else {
            let url = format!("{}/v1/models", base_url);
            let templates = if api_key.is_some() {
                default_header_templates(&channel.provider)
            } else {
                std::collections::HashMap::new()
            };
            (url, templates)
        };

    Ok(send_test_request("GET", &test_url, &header_templates, api_key.as_deref()).await)
}

#[tauri::command]
pub async fn test_channel_custom(
    state: State<'_, AppState>,
    channel_id: Option<String>,
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
) -> Result<serde_json::Value, IpcError> {
    let api_key = if let Some(cid) = &channel_id {
        fetch_api_key(&state.db, cid).await?
    } else {
        None
    };

    Ok(send_test_request(&method.to_uppercase(), &url, &headers, api_key.as_deref()).await)
}

#[tauri::command]
pub async fn save_channel_test_config(
    state: State<'_, AppState>,
    id: String,
    test_url: Option<String>,
    test_headers: Option<String>,
) -> Result<(), IpcError> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("UPDATE channels SET test_url = ?, test_headers = ?, updated_at = ? WHERE id = ?")
        .bind(&test_url)
        .bind(&test_headers)
        .bind(&now)
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}
