use crate::db::models::Token;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_tokens(state: State<'_, AppState>) -> Result<Vec<Token>, String> {
    sqlx::query_as::<_, Token>("SELECT * FROM tokens ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_token(
    state: State<'_, AppState>,
    name: Option<String>,
    quota_limit: Option<i64>,
    expires_at: Option<String>,
    allowed_models: Option<String>,
) -> Result<Token, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let key_value = format!("sk-{}", uuid::Uuid::new_v4().to_string().replace("-", ""));
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO tokens (id, name, key_value, quota_limit, quota_used, expires_at, allowed_models, enabled, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, 1, ?)"
    )
    .bind(&id).bind(&name).bind(&key_value)
    .bind(quota_limit).bind(&expires_at).bind(&allowed_models).bind(&now)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Token>("SELECT * FROM tokens WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_token(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    quota_limit: Option<i64>,
    expires_at: Option<String>,
    allowed_models: Option<String>,
    enabled: bool,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE tokens SET name = ?, quota_limit = ?, expires_at = ?, allowed_models = ?, enabled = ? WHERE id = ?"
    )
    .bind(&name).bind(quota_limit).bind(&expires_at)
    .bind(&allowed_models).bind(enabled).bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_token(state: State<'_, AppState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM tokens WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn reset_token_quota(state: State<'_, AppState>, id: String) -> Result<(), String> {
    sqlx::query("UPDATE tokens SET quota_used = 0 WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
