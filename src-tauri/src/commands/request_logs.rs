use crate::db::models::RequestLog;
use crate::AppState;
use serde::Serialize;
use tauri::State;

#[tauri::command]
pub async fn list_request_logs(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
    model: Option<String>,
) -> Result<Vec<RequestLog>, String> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    if let Some(model) = model {
        sqlx::query_as::<_, RequestLog>(
            "SELECT * FROM request_logs WHERE model = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(&model).bind(limit).bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
    } else {
        sqlx::query_as::<_, RequestLog>(
            "SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(limit).bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn get_request_log(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<RequestLog>, String> {
    sqlx::query_as::<_, RequestLog>("SELECT * FROM request_logs WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_request_logs(state: State<'_, AppState>) -> Result<(), String> {
    sqlx::query("DELETE FROM request_logs")
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_usage_stats(
    state: State<'_, AppState>,
    days: Option<i32>,
) -> Result<serde_json::Value, String> {
    let days = days.unwrap_or(7);
    let since = chrono::Utc::now() - chrono::Duration::days(days as i64);
    let since_str = since.to_rfc3339();

    let daily_stats: Vec<(String, i64, i64, i64)> = sqlx::query_as(
        "SELECT DATE(created_at) as date, COUNT(*) as count, COALESCE(SUM(prompt_tokens), 0) as prompt_tokens, COALESCE(SUM(completion_tokens), 0) as completion_tokens FROM request_logs WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY date ASC"
    )
    .bind(&since_str)
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let daily: Vec<serde_json::Value> = daily_stats.iter().map(|(date, count, pt, ct)| {
        serde_json::json!({
            "date": date,
            "count": count,
            "prompt_tokens": pt,
            "completion_tokens": ct,
        })
    }).collect();

    let model_stats: Vec<(String, i64)> = sqlx::query_as(
        "SELECT COALESCE(model, 'unknown') as model, COUNT(*) as count FROM request_logs WHERE created_at >= ? GROUP BY model ORDER BY count DESC"
    )
    .bind(&since_str)
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let by_model: Vec<serde_json::Value> = model_stats.iter().map(|(model, count)| {
        serde_json::json!({
            "model": model,
            "count": count,
        })
    }).collect();

    Ok(serde_json::json!({
        "daily": daily,
        "by_model": by_model,
    }))
}

#[derive(Serialize)]
pub struct RetryResult {
    pub status: u16,
    pub body: String,
}

#[tauri::command]
pub async fn retry_request_log(
    state: State<'_, AppState>,
    id: String,
) -> Result<RetryResult, String> {
    // 1. Fetch the original log entry
    let log = sqlx::query_as::<_, RequestLog>("SELECT * FROM request_logs WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Log not found".to_string())?;

    let request_body = log.request_body.ok_or_else(|| "No request body".to_string())?;
    let input_format = log.input_format.ok_or_else(|| "No input format".to_string())?;
    let token_id = log.token_id.ok_or_else(|| "No token ID".to_string())?;

    // 2. Fetch the token to get key_value
    let token = sqlx::query_as::<_, crate::db::models::Token>(
        "SELECT * FROM tokens WHERE id = ?",
    )
    .bind(&token_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Token not found".to_string())?;

    // 3. Determine endpoint path from input_format
    let path = match input_format.as_str() {
        "openai_chat" => "/v1/chat/completions",
        "anthropic" => "/v1/messages",
        "openai_responses" => "/v1/responses",
        "moonshot" => "/v1/chat/completions",
        other => return Err(format!("Unknown input format: {}", other)),
    };

    // 4. Send request to local proxy
    let port = state.config.read().await.server_port;
    let url = format!("http://127.0.0.1:{}{}", port, path);

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token.key_value))
        .body(request_body)
        .send()
        .await
        .map_err(|e| format!("Retry failed: {}", e))?;

    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(RetryResult { status, body })
}
