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
