mod commands;
mod config;
mod db;
mod error;
mod modality;
mod routing;
mod rules;
mod server;
mod video;

use sqlx::SqlitePool;
use tauri::Manager;
use tokio::sync::RwLock;

pub struct AppState {
    pub db: SqlitePool,
    pub config: RwLock<config::AppConfig>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::get_server_status,
            commands::config::update_config,
            commands::channels::list_channels,
            commands::channels::create_channel,
            commands::channels::update_channel,
            commands::channels::delete_channel,
            commands::channels::list_channel_api_keys,
            commands::channels::add_channel_api_key,
            commands::channels::delete_channel_api_key,
            commands::channels::toggle_channel_api_key,
            commands::channels::test_channel,
            commands::channels::test_channel_custom,
            commands::channels::save_channel_test_config,
            commands::tokens::list_tokens,
            commands::tokens::create_token,
            commands::tokens::update_token,
            commands::tokens::delete_token,
            commands::tokens::reset_token_quota,
            commands::model_mappings::list_model_mappings,
            commands::model_mappings::create_model_mapping,
            commands::model_mappings::update_model_mapping,
            commands::model_mappings::delete_model_mapping,
            commands::request_logs::list_request_logs,
            commands::request_logs::get_request_log,
            commands::request_logs::clear_request_logs,
            commands::request_logs::get_usage_stats,
            commands::request_logs::retry_request_log,
            commands::proxy::list_proxy_rules,
            commands::proxy::create_proxy_rule,
            commands::proxy::update_proxy_rule,
            commands::proxy::delete_proxy_rule,
            commands::proxy::list_proxy_logs,
            commands::proxy::get_proxy_log,
            commands::proxy::clear_proxy_logs,
            commands::rules::list_conversion_rules,
            commands::rules::get_conversion_rule,
            commands::rules::set_conversion_rule_enabled,
            commands::video::parse_video_url,
            commands::video::download_video,
            commands::video::cancel_video_download,
            commands::video::open_in_folder,
            commands::video::save_video_record,
            commands::video::list_video_records,
            commands::video::delete_video_record,
            commands::video::clear_video_records,
            commands::video::update_video_record_status,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let app_dir = app_handle
                    .path()
                    .app_data_dir()
                    .expect("failed to resolve app data dir");
                let db_path = app_dir.join("omnikit.db");

                let pool = db::init_pool(&db_path)
                    .await
                    .expect("failed to initialize database");

                // Seed built-in system rules on first startup
                if let Err(e) = rules::seed_system_rules(&pool).await {
                    log::error!("Failed to seed system rules: {}", e);
                }

                let config = config::AppConfig::load_from_db(&pool)
                    .await
                    .unwrap_or_default();
                let server_port = config.server_port;

                let state = AppState {
                    db: pool.clone(),
                    config: RwLock::new(config),
                };
                app_handle.manage(state);
                app_handle.manage(video::downloader::DownloadManager::new());

                // Start Axum HTTP server in background
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = server::start(pool, server_port).await {
                        log::error!("Axum server error: {}", e);
                    }
                });
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
