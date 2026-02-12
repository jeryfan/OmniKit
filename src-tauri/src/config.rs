use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server_port: u16,
    pub log_retention_days: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_port: 9000,
            log_retention_days: 30,
        }
    }
}

impl AppConfig {
    pub async fn load_from_db(pool: &SqlitePool) -> Result<Self, sqlx::Error> {
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT key, value FROM app_config")
                .fetch_all(pool)
                .await?;

        let mut config = Self::default();

        for (key, value) in &rows {
            match key.as_str() {
                "server_port" => {
                    if let Ok(port) = value.parse::<u16>() {
                        config.server_port = port;
                    }
                }
                "log_retention_days" => {
                    if let Ok(days) = value.parse::<u32>() {
                        config.log_retention_days = days;
                    }
                }
                _ => {}
            }
        }

        Ok(config)
    }
}
