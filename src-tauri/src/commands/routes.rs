use crate::db::models::{Route, RouteTarget, RouteTargetKey};
use crate::error::IpcError;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct TargetInput {
    pub upstream_format: String,
    pub base_url: String,
    pub weight: i32,
    pub enabled: bool,
    pub key_rotation: bool,
    pub keys: Vec<String>,
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

#[derive(Debug, Serialize)]
pub struct TestRouteResult {
    pub status: u16,
    pub body: String,
    pub latency_ms: i64,
    pub error: Option<String>,
}

fn test_request_path(input_format: &str) -> &'static str {
    match input_format {
        "anthropic" => "/v1/messages",
        "openai-chat" | "moonshot" => "/v1/chat/completions",
        "openai-responses" => "/v1/responses",
        "gemini" => "/v1beta/models/gemini-pro:generateContent",
        _ => "/v1/chat/completions",
    }
}

fn test_request_body(input_format: &str) -> &'static str {
    match input_format {
        "anthropic" => r#"{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}"#,
        "openai-chat" | "moonshot" => r#"{"model":"gpt-3.5-turbo","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}"#,
        "openai-responses" => r#"{"model":"gpt-3.5-turbo","max_tokens":10,"input":"Hi"}"#,
        "gemini" => r#"{"contents":[{"parts":[{"text":"Hi"}]}]}"#,
        _ => r#"{"model":"gpt-3.5-turbo","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}"#,
    }
}

#[tauri::command]
pub async fn test_route(
    state: State<'_, AppState>,
    route_id: String,
    token_key: String,
) -> Result<TestRouteResult, IpcError> {
    // Load route
    let route = sqlx::query_as::<_, Route>("SELECT * FROM routes WHERE id = ?")
        .bind(&route_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| IpcError::not_found("Route not found"))?;

    // Get server port from config
    let config = state.config.read().await;
    let port = config.server_port;
    drop(config);

    let path = test_request_path(&route.input_format);
    let body = test_request_body(&route.input_format);
    let url = format!(
        "http://127.0.0.1:{}{}{}",
        port,
        route.path_prefix.trim_end_matches('/'),
        path
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| IpcError::internal(e.to_string()))?;

    let start = std::time::Instant::now();
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token_key))
        .body(body)
        .send()
        .await;
    let latency_ms = start.elapsed().as_millis() as i64;

    match resp {
        Ok(r) => {
            let status = r.status().as_u16();
            let body = r.text().await.unwrap_or_default();
            Ok(TestRouteResult { status, body, latency_ms, error: None })
        }
        Err(e) => Ok(TestRouteResult {
            status: 0,
            body: String::new(),
            latency_ms,
            error: Some(e.to_string()),
        }),
    }
}
