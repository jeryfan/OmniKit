pub mod engine;
pub mod registry;
pub mod repository;

use serde::{Deserialize, Serialize};

/// Represents a conversion rule's HTTP configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpConfig {
    #[serde(default = "default_auth_template")]
    pub auth_header_template: String,
    #[serde(default)]
    pub url_template: String,
    #[serde(default = "default_content_type")]
    pub content_type: String,
}

fn default_auth_template() -> String {
    "Bearer {{key}}".to_string()
}

fn default_content_type() -> String {
    "application/json".to_string()
}

impl HttpConfig {
    pub fn parse(json: Option<&str>) -> Option<Self> {
        json.and_then(|s| serde_json::from_str(s).ok())
    }
}

/// Seed the built-in system rules into the database if they don't exist yet.
pub async fn seed_system_rules(db: &sqlx::SqlitePool) -> Result<(), sqlx::Error> {
    let system_rules = vec![
        ("openai-chat", "OpenAI Chat Completions", "Built-in OpenAI Chat Completions codec"),
        ("openai-responses", "OpenAI Responses", "Built-in OpenAI Responses codec"),
        ("anthropic", "Anthropic Messages", "Built-in Anthropic Messages codec"),
        ("gemini", "Gemini", "Built-in Google Gemini codec"),
        ("moonshot", "Moonshot (Kimi)", "Built-in Moonshot codec"),
    ];

    let now = chrono::Utc::now().to_rfc3339();

    for (slug, name, desc) in system_rules {
        let exists = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM conversion_rules WHERE slug = ?",
        )
        .bind(slug)
        .fetch_one(db)
        .await
        .unwrap_or(0);

        if exists == 0 {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO conversion_rules (id, slug, name, description, rule_type, modality, decode_request, encode_request, decode_response, encode_response, http_config, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 'system', 'chat', '', '', '', '', NULL, 1, ?, ?)"
            )
            .bind(&id).bind(slug).bind(name).bind(desc)
            .bind(&now).bind(&now)
            .execute(db)
            .await?;
        }
    }

    Ok(())
}
