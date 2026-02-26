use crate::db::models::ConversionRule;
use crate::error::IpcError;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_conversion_rules(
    state: State<'_, AppState>,
) -> Result<Vec<ConversionRule>, IpcError> {
    Ok(sqlx::query_as::<_, ConversionRule>(
        "SELECT * FROM conversion_rules WHERE rule_type = 'system' ORDER BY name ASC",
    )
    .fetch_all(&state.db)
    .await?)
}

#[tauri::command]
pub async fn get_conversion_rule(
    state: State<'_, AppState>,
    id: String,
) -> Result<ConversionRule, IpcError> {
    sqlx::query_as::<_, ConversionRule>(
        "SELECT * FROM conversion_rules WHERE id = ? AND rule_type = 'system'",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| IpcError::not_found("Conversion rule not found"))
}

#[tauri::command]
pub async fn set_conversion_rule_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<(), IpcError> {
    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE conversion_rules SET enabled = ?, updated_at = ? WHERE id = ? AND rule_type = 'system'",
    )
    .bind(enabled)
    .bind(&now)
    .bind(&id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(IpcError::not_found("Conversion rule not found"));
    }

    Ok(())
}
