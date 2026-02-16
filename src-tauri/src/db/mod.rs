pub mod models;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

pub async fn init_pool(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    let options = SqliteConnectOptions::from_str(&db_url)?
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    seed_default_token(&pool).await?;

    Ok(pool)
}

/// If the `tokens` table is empty, insert a default token so users can start
/// using the API gateway immediately without manually creating one.
async fn seed_default_token(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tokens")
        .fetch_one(pool)
        .await?;

    if count == 0 {
        let id = uuid::Uuid::new_v4().to_string();
        let key_value = format!("sk-{}", uuid::Uuid::new_v4().to_string().replace("-", ""));
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO tokens (id, name, key_value, quota_limit, quota_used, expires_at, allowed_models, enabled, created_at) VALUES (?, 'Default', ?, NULL, 0, NULL, NULL, 1, ?)"
        )
        .bind(&id)
        .bind(&key_value)
        .bind(&now)
        .execute(pool)
        .await?;

        log::info!("Created default token: {}", key_value);
    }

    Ok(())
}
