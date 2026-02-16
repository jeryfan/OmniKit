use super::{DownloadProgress, DownloadStatus, VideoFormat};
use crate::error::IpcError;
use futures_util::StreamExt;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

struct ActiveTask {
    cancel_token: CancellationToken,
    #[allow(dead_code)]
    title: String,
}

#[derive(Clone)]
pub struct DownloadManager {
    tasks: Arc<RwLock<HashMap<String, ActiveTask>>>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn start_download(
        &self,
        app: AppHandle,
        task_id: String,
        title: String,
        format: VideoFormat,
        save_dir: PathBuf,
        audio_only: bool,
    ) -> Result<PathBuf, IpcError> {
        // Sanitize filename
        let sanitized_title = sanitize_filename(&title);
        let save_path = if audio_only {
            if format.audio_url.is_none() {
                return Err(IpcError::validation(
                    "Audio-only download is unavailable for this format",
                ));
            }
            save_dir.join(format!("{}.m4a", sanitized_title))
        } else {
            save_dir.join(format!("{}.mp4", sanitized_title))
        };

        // Ensure save directory exists
        tokio::fs::create_dir_all(&save_dir)
            .await
            .map_err(|e| IpcError::internal(format!("Failed to create save directory: {}", e)))?;

        let cancel_token = CancellationToken::new();

        {
            let mut tasks = self.tasks.write().await;
            tasks.insert(
                task_id.clone(),
                ActiveTask {
                    cancel_token: cancel_token.clone(),
                    title,
                },
            );
        }

        let tasks_ref = self.tasks.clone();
        let task_id_clone = task_id.clone();
        let save_path_clone = save_path.clone();

        tokio::spawn(async move {
            let result = do_download(
                &app,
                &task_id_clone,
                &format,
                &save_path_clone,
                &cancel_token,
                audio_only,
            )
            .await;

            // Clean up task entry
            {
                let mut tasks = tasks_ref.write().await;
                tasks.remove(&task_id_clone);
            }

            match result {
                Ok(()) => {
                    let _ = app.emit(
                        "video-download-progress",
                        DownloadProgress {
                            task_id: task_id_clone,
                            downloaded: 0,
                            total: None,
                            speed: 0,
                            status: DownloadStatus::Completed,
                        },
                    );
                }
                Err(e) => {
                    let _ = app.emit(
                        "video-download-progress",
                        DownloadProgress {
                            task_id: task_id_clone,
                            downloaded: 0,
                            total: None,
                            speed: 0,
                            status: DownloadStatus::Failed(e.message),
                        },
                    );
                }
            }
        });

        Ok(save_path)
    }

    pub async fn cancel_download(&self, task_id: &str) -> Result<(), IpcError> {
        let tasks = self.tasks.read().await;
        if let Some(task) = tasks.get(task_id) {
            task.cancel_token.cancel();
            Ok(())
        } else {
            Err(IpcError::not_found("Download task not found"))
        }
    }
}

async fn do_download(
    app: &AppHandle,
    task_id: &str,
    format: &VideoFormat,
    save_path: &PathBuf,
    cancel_token: &CancellationToken,
    audio_only: bool,
) -> Result<(), IpcError> {
    let client = super::create_http_client();

    if audio_only {
        let audio_url = format.audio_url.as_ref().ok_or_else(|| {
            IpcError::validation("Audio-only download is unavailable for this format")
        })?;
        download_file(app, task_id, &client, audio_url, save_path, cancel_token).await?;
        return Ok(());
    }

    // Download video
    download_file(app, task_id, &client, &format.url, save_path, cancel_token).await?;

    // If there's a separate audio URL, download and we just save it alongside
    // (full muxing would require ffmpeg, so we save audio separately)
    if let Some(audio_url) = &format.audio_url {
        let audio_path = save_path.with_extension("audio.m4a");
        download_file(app, task_id, &client, audio_url, &audio_path, cancel_token).await?;
    }

    Ok(())
}

async fn download_file(
    app: &AppHandle,
    task_id: &str,
    _client: &reqwest::Client,
    url: &str,
    save_path: &PathBuf,
    cancel_token: &CancellationToken,
) -> Result<(), IpcError> {
    // Resolve the actual CDN URL first, then download with a clean request.
    // This avoids issues where redirect chains carry headers that CDNs reject (e.g. Douyin 403).
    let is_bilibili = url.contains("bilibili.com") || url.contains("bilivideo.");

    let (final_url, referer) = if is_bilibili {
        (url.to_string(), Some("https://www.bilibili.com/"))
    } else {
        // For non-bilibili URLs (e.g. Douyin aweme.snssdk.com), manually resolve 302
        // to get the CDN URL, then download the CDN URL directly without extra headers.
        let resolved = resolve_cdn_url(url).await.unwrap_or_else(|_| url.to_string());
        (resolved, None)
    };

    let dl_client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| IpcError::internal(e.to_string()))?;

    let mut req = dl_client.get(&final_url);
    if let Some(r) = referer {
        req = req.header("Referer", r);
    }
    let resp = req.send().await?;

    let total = resp.content_length();
    let mut stream = resp.bytes_stream();

    let mut file = tokio::fs::File::create(save_path)
        .await
        .map_err(|e| IpcError::internal(format!("Failed to create file: {}", e)))?;

    let mut downloaded: u64 = 0;
    let mut last_report = tokio::time::Instant::now();
    let mut last_downloaded: u64 = 0;
    let report_interval = tokio::time::Duration::from_millis(200);

    loop {
        tokio::select! {
            _ = cancel_token.cancelled() => {
                // Clean up partial file
                drop(file);
                let _ = tokio::fs::remove_file(save_path).await;
                let _ = app.emit(
                    "video-download-progress",
                    DownloadProgress {
                        task_id: task_id.to_string(),
                        downloaded,
                        total,
                        speed: 0,
                        status: DownloadStatus::Cancelled,
                    },
                );
                return Err(IpcError::internal("Download cancelled"));
            }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        file.write_all(&bytes)
                            .await
                            .map_err(|e| IpcError::internal(format!("Failed to write file: {}", e)))?;

                        downloaded += bytes.len() as u64;

                        let now = tokio::time::Instant::now();
                        if now.duration_since(last_report) >= report_interval {
                            let elapsed = now.duration_since(last_report).as_secs_f64();
                            let speed = if elapsed > 0.0 {
                                ((downloaded - last_downloaded) as f64 / elapsed) as u64
                            } else {
                                0
                            };

                            let _ = app.emit(
                                "video-download-progress",
                                DownloadProgress {
                                    task_id: task_id.to_string(),
                                    downloaded,
                                    total,
                                    speed,
                                    status: DownloadStatus::Downloading,
                                },
                            );

                            last_report = now;
                            last_downloaded = downloaded;
                        }
                    }
                    Some(Err(e)) => {
                        drop(file);
                        let _ = tokio::fs::remove_file(save_path).await;
                        return Err(IpcError::internal(format!("Download error: {}", e)));
                    }
                    None => {
                        // Stream completed
                        file.flush()
                            .await
                            .map_err(|e| IpcError::internal(format!("Failed to flush file: {}", e)))?;
                        break;
                    }
                }
            }
        }
    }

    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Resolve a URL that returns 302 to get the final CDN URL without downloading the body.
/// This lets us make a clean, header-free request to the CDN directly.
async fn resolve_cdn_url(url: &str) -> Result<String, IpcError> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| IpcError::internal(e.to_string()))?;

    let resp = client.get(url).send().await?;

    if resp.status().is_redirection() {
        if let Some(location) = resp.headers().get("location") {
            let loc = location
                .to_str()
                .map_err(|e| IpcError::internal(e.to_string()))?;
            return Ok(loc.to_string());
        }
    }

    // No redirect — use original URL
    Ok(url.to_string())
}
