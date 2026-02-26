pub const SYSTEM_RULES: [(&str, &str, &str); 5] = [
    (
        "openai-chat",
        "OpenAI Chat Completions",
        "Built-in OpenAI Chat Completions codec",
    ),
    (
        "openai-responses",
        "OpenAI Responses",
        "Built-in OpenAI Responses codec",
    ),
    (
        "anthropic",
        "Anthropic Messages",
        "Built-in Anthropic Messages codec",
    ),
    ("gemini", "Gemini", "Built-in Google Gemini codec"),
    ("moonshot", "Moonshot (Kimi)", "Built-in Moonshot codec"),
];

pub fn is_system_rule_slug(slug: &str) -> bool {
    SYSTEM_RULES
        .iter()
        .any(|(system_slug, _, _)| *system_slug == slug)
}

fn system_rule_slugs_sql_list() -> String {
    SYSTEM_RULES
        .iter()
        .map(|(slug, _, _)| format!("'{}'", slug.replace('\'', "''")))
        .collect::<Vec<String>>()
        .join(",")
}

/// Seed the built-in system rules into the database if they don't exist yet.
pub async fn seed_system_rules(db: &sqlx::SqlitePool) -> Result<(), sqlx::Error> {
    // Keep only canonical built-in rules. User-defined rules are no longer supported.
    let allowed_slugs = system_rule_slugs_sql_list();
    let cleanup_sql = format!(
        "DELETE FROM conversion_rules WHERE rule_type <> 'system' OR slug NOT IN ({})",
        allowed_slugs
    );
    sqlx::query(&cleanup_sql).execute(db).await?;
    sqlx::query("UPDATE channels SET provider = 'openai-chat' WHERE provider = 'openai'")
        .execute(db)
        .await?;

    let now = chrono::Utc::now().to_rfc3339();

    for (slug, name, desc) in SYSTEM_RULES {
        let exists =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM conversion_rules WHERE slug = ?")
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
        } else {
            sqlx::query(
                "UPDATE conversion_rules SET name = ?, description = ?, rule_type = 'system', modality = 'chat', updated_at = ? WHERE slug = ?",
            )
            .bind(name)
            .bind(desc)
            .bind(&now)
            .bind(slug)
            .execute(db)
            .await?;
        }
    }

    Ok(())
}
