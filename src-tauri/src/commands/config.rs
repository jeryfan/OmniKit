use crate::AppState;
use crate::config::AppConfig;
use tauri::State;

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    Ok(state.config.read().await.clone())
}

#[tauri::command]
pub async fn get_server_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let port = state.config.read().await.server_port;
    let url = format!("http://127.0.0.1:{}/health", port);

    match reqwest::get(&url).await {
        Ok(resp) => {
            let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(body)
        }
        Err(e) => Ok(serde_json::json!({
            "status": "error",
            "message": e.to_string(),
        })),
    }
}

#[tauri::command]
pub async fn update_config(
    state: State<'_, AppState>,
    server_port: u16,
    log_retention_days: u32,
) -> Result<AppConfig, String> {
    // UPSERT into app_config table
    sqlx::query(
        "INSERT INTO app_config (key, value) VALUES ('server_port', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
    )
    .bind(server_port.to_string())
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO app_config (key, value) VALUES ('log_retention_days', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
    )
    .bind(log_retention_days.to_string())
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    // Update in-memory config
    let mut config = state.config.write().await;
    config.server_port = server_port;
    config.log_retention_days = log_retention_days;

    Ok(config.clone())
}
