use crate::db::models::ModelMapping;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_model_mappings(state: State<'_, AppState>) -> Result<Vec<ModelMapping>, String> {
    sqlx::query_as::<_, ModelMapping>("SELECT * FROM model_mappings ORDER BY public_name ASC")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_model_mapping(
    state: State<'_, AppState>,
    public_name: String,
    channel_id: String,
    actual_name: String,
    modality: String,
) -> Result<ModelMapping, String> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO model_mappings (id, public_name, channel_id, actual_name, modality) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(&public_name).bind(&channel_id)
    .bind(&actual_name).bind(&modality)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, ModelMapping>("SELECT * FROM model_mappings WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_model_mapping(
    state: State<'_, AppState>,
    id: String,
    public_name: String,
    channel_id: String,
    actual_name: String,
    modality: String,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE model_mappings SET public_name = ?, channel_id = ?, actual_name = ?, modality = ? WHERE id = ?"
    )
    .bind(&public_name).bind(&channel_id)
    .bind(&actual_name).bind(&modality).bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_model_mapping(state: State<'_, AppState>, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM model_mappings WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
