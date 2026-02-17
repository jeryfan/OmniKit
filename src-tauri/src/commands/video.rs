use crate::db::models::VideoRecord;
use crate::error::IpcError;
use crate::video::{self, VideoInfo};
use crate::video::downloader::DownloadManager;
use crate::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn parse_video_url(url: String) -> Result<VideoInfo, IpcError> {
    video::parse_video_url(&url).await
}

#[tauri::command]
pub async fn download_video(
    app: AppHandle,
    manager: State<'_, DownloadManager>,
    task_id: String,
    title: String,
    video_url: String,
    audio_url: Option<String>,
    quality: String,
    save_dir: Option<String>,
    audio_only: Option<bool>,
) -> Result<String, IpcError> {
    let audio_only = audio_only.unwrap_or(false);
    let save_dir = if let Some(dir) = save_dir {
        PathBuf::from(dir)
    } else {
        dirs::download_dir()
            .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
            .ok_or_else(|| IpcError::internal("Cannot determine download directory"))?
    };

    let format = video::VideoFormat {
        quality,
        url: video_url,
        audio_url,
        size: None,
    };

    let save_path = manager
        .start_download(app, task_id, title, format, save_dir, audio_only)
        .await?;

    Ok(save_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn cancel_video_download(
    manager: State<'_, DownloadManager>,
    task_id: String,
) -> Result<(), IpcError> {
    manager.cancel_download(&task_id).await
}

#[tauri::command]
pub async fn open_in_folder(path: String) -> Result<(), IpcError> {
    let path = PathBuf::from(&path);
    if !path.exists() {
        return Err(IpcError::not_found("File not found"));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| IpcError::internal(e.to_string()))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| IpcError::internal(e.to_string()))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path.parent().unwrap_or(&path))
            .spawn()
            .map_err(|e| IpcError::internal(e.to_string()))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn save_video_record(
    state: State<'_, AppState>,
    url: String,
    title: String,
    cover_url: Option<String>,
    duration: Option<i64>,
    platform: String,
    formats: String,
) -> Result<VideoRecord, IpcError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO video_records (id, url, title, cover_url, duration, platform, formats, download_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
    )
    .bind(&id)
    .bind(&url)
    .bind(&title)
    .bind(&cover_url)
    .bind(&duration)
    .bind(&platform)
    .bind(&formats)
    .bind(&now)
    .execute(&state.db)
    .await
    .map_err(|e| IpcError::internal(e.to_string()))?;

    let record = sqlx::query_as::<_, VideoRecord>("SELECT * FROM video_records WHERE id = ?")
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| IpcError::internal(e.to_string()))?;

    Ok(record)
}

#[tauri::command]
pub async fn list_video_records(
    state: State<'_, AppState>,
) -> Result<Vec<VideoRecord>, IpcError> {
    let records = sqlx::query_as::<_, VideoRecord>(
        "SELECT * FROM video_records ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| IpcError::internal(e.to_string()))?;

    Ok(records)
}

#[tauri::command]
pub async fn delete_video_record(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), IpcError> {
    sqlx::query("DELETE FROM video_records WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| IpcError::internal(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn clear_video_records(
    state: State<'_, AppState>,
) -> Result<(), IpcError> {
    sqlx::query("DELETE FROM video_records")
        .execute(&state.db)
        .await
        .map_err(|e| IpcError::internal(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn update_video_record_status(
    state: State<'_, AppState>,
    id: String,
    download_status: String,
    save_path: Option<String>,
) -> Result<(), IpcError> {
    sqlx::query(
        "UPDATE video_records SET download_status = ?, save_path = ? WHERE id = ?"
    )
    .bind(&download_status)
    .bind(&save_path)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| IpcError::internal(e.to_string()))?;
    Ok(())
}
