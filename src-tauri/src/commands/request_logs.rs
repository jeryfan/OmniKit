use crate::db::models::RequestLog;
use crate::error::IpcError;
use crate::AppState;
use serde::Serialize;
use tauri::State;

use super::PaginatedResult;

#[tauri::command]
pub async fn list_request_logs(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
    model: Option<String>,
) -> Result<PaginatedResult<RequestLog>, IpcError> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    let (items, total) = if let Some(model) = model {
        let items = sqlx::query_as::<_, RequestLog>(
            "SELECT * FROM request_logs WHERE model = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(&model).bind(limit).bind(offset)
        .fetch_all(&state.db)
        .await?;

        let (total,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM request_logs WHERE model = ?"
        )
        .bind(&model)
        .fetch_one(&state.db)
        .await?;

        (items, total)
    } else {
        let items = sqlx::query_as::<_, RequestLog>(
            "SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(limit).bind(offset)
        .fetch_all(&state.db)
        .await?;

        let (total,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM request_logs"
        )
        .fetch_one(&state.db)
        .await?;

        (items, total)
    };

    Ok(PaginatedResult { items, total })
}

#[tauri::command]
pub async fn get_request_log(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<RequestLog>, IpcError> {
    Ok(sqlx::query_as::<_, RequestLog>("SELECT * FROM request_logs WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await?)
}

#[tauri::command]
pub async fn clear_request_logs(state: State<'_, AppState>) -> Result<(), IpcError> {
    sqlx::query("DELETE FROM request_logs")
        .execute(&state.db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_usage_stats(
    state: State<'_, AppState>,
    days: Option<i32>,
) -> Result<serde_json::Value, IpcError> {
    let days = days.unwrap_or(7);
    let since = chrono::Utc::now() - chrono::Duration::days(days as i64);
    let since_str = since.to_rfc3339();

    let daily_stats: Vec<(String, i64, i64, i64)> = sqlx::query_as(
        "SELECT DATE(created_at) as date, COUNT(*) as count, COALESCE(SUM(prompt_tokens), 0) as prompt_tokens, COALESCE(SUM(completion_tokens), 0) as completion_tokens FROM request_logs WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY date ASC"
    )
    .bind(&since_str)
    .fetch_all(&state.db)
    .await?;

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
    .await?;

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
) -> Result<RetryResult, IpcError> {
    // 1. Fetch the original log entry
    let log = sqlx::query_as::<_, RequestLog>("SELECT * FROM request_logs WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| IpcError::not_found("Log not found"))?;

    let request_body = log.request_body.ok_or_else(|| IpcError::validation("No request body"))?;
    let input_format = log.input_format.ok_or_else(|| IpcError::validation("No input format"))?;
    let token_id = log.token_id.ok_or_else(|| IpcError::validation("No token ID"))?;

    // 2. Fetch the token to get key_value
    let token = sqlx::query_as::<_, crate::db::models::Token>(
        "SELECT * FROM tokens WHERE id = ?",
    )
    .bind(&token_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| IpcError::not_found("Token not found"))?;

    // 3. Determine endpoint path from input_format
    let path = match input_format.as_str() {
        "openai_chat" => "/v1/chat/completions",
        "anthropic" => "/v1/messages",
        "openai_responses" => "/v1/responses",
        "moonshot" => "/v1/chat/completions",
        other => return Err(IpcError::validation(format!("Unknown input format: {}", other))),
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
        .await?;

    let status = resp.status().as_u16();
    let body = resp.text().await?;

    Ok(RetryResult { status, body })
}
