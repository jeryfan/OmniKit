use crate::db::models::{Channel, ModelMapping};
use crate::error::AppError;
use crate::routing::circuit::CircuitBreaker;
use rand::Rng;
use sqlx::SqlitePool;

/// Result of channel selection: the channel, model mapping, and API key to use.
pub struct SelectedChannel {
    pub channel: Channel,
    pub mapping: ModelMapping,
    pub api_key: String,
}

/// Select the best available channel for a given model.
///
/// Algorithm:
/// 1. Find all enabled channels with a mapping for the requested model
/// 2. Group by priority (lower number = higher priority)
/// 3. Within each priority group, filter out channels with open circuit breakers
/// 4. Select by weighted random from available channels
/// 5. If no channels available in current priority, try next priority group
/// 6. If all exhausted, return AllChannelsFailed
pub async fn select_channel(
    model: &str,
    db: &SqlitePool,
    circuit: &CircuitBreaker,
) -> Result<SelectedChannel, AppError> {
    // Fetch all candidate channels with their mappings, ordered by priority
    let rows = sqlx::query_as::<_, ChannelWithMapping>(
        "SELECT c.id as channel_id, c.name, c.provider, c.base_url,
                c.priority, c.weight, c.enabled, c.key_rotation,
                c.rate_limit, c.created_at, c.updated_at,
                m.id as mapping_id, m.public_name, m.actual_name, m.modality
         FROM model_mappings m
         JOIN channels c ON m.channel_id = c.id
         WHERE m.public_name = ? AND c.enabled = 1
         ORDER BY c.priority ASC",
    )
    .bind(model)
    .fetch_all(db)
    .await?;

    if rows.is_empty() {
        return Err(AppError::NoChannel(model.to_string()));
    }

    // Group by priority
    let mut priority_groups: Vec<(i32, Vec<&ChannelWithMapping>)> = Vec::new();
    for row in &rows {
        if let Some(group) = priority_groups.last_mut() {
            if group.0 == row.priority {
                group.1.push(row);
                continue;
            }
        }
        priority_groups.push((row.priority, vec![row]));
    }

    // Try each priority group
    for (_priority, group) in &priority_groups {
        // Filter by circuit breaker
        let available: Vec<&&ChannelWithMapping> = group
            .iter()
            .filter(|r| circuit.is_available(&r.channel_id))
            .collect();

        if available.is_empty() {
            continue;
        }

        // Weighted random selection
        let selected = weighted_random_select(&available);

        // Fetch API key
        let api_key = sqlx::query_scalar::<_, String>(
            "SELECT key_value FROM channel_api_keys WHERE channel_id = ? AND enabled = 1 LIMIT 1",
        )
        .bind(&selected.channel_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| {
            AppError::Internal(format!(
                "No API key for channel '{}'",
                selected.name
            ))
        })?;

        return Ok(SelectedChannel {
            channel: Channel {
                id: selected.channel_id.clone(),
                name: selected.name.clone(),
                provider: selected.provider.clone(),
                base_url: selected.base_url.clone(),
                priority: selected.priority,
                weight: selected.weight,
                enabled: selected.enabled,
                key_rotation: selected.key_rotation,
                rate_limit: selected.rate_limit.clone(),
                test_url: None,
                test_headers: None,
                created_at: selected.created_at.clone(),
                updated_at: selected.updated_at.clone(),
            },
            mapping: ModelMapping {
                id: selected.mapping_id.clone(),
                public_name: selected.public_name.clone(),
                channel_id: selected.channel_id.clone(),
                actual_name: selected.actual_name.clone(),
                modality: selected.modality.clone(),
            },
            api_key,
        });
    }

    Err(AppError::AllChannelsFailed(model.to_string()))
}

fn weighted_random_select<'a>(channels: &[&'a &ChannelWithMapping]) -> &'a ChannelWithMapping {
    if channels.len() == 1 {
        return channels[0];
    }

    let total_weight: i32 = channels.iter().map(|c| c.weight.max(1)).sum();
    let mut rng = rand::rng();
    let mut pick = rng.random_range(0..total_weight);

    for ch in channels {
        pick -= ch.weight.max(1);
        if pick < 0 {
            return ch;
        }
    }

    channels.last().unwrap()
}

// Internal joined query result
#[derive(Debug, sqlx::FromRow)]
struct ChannelWithMapping {
    channel_id: String,
    name: String,
    provider: String,
    base_url: String,
    priority: i32,
    weight: i32,
    enabled: bool,
    key_rotation: bool,
    rate_limit: Option<String>,
    created_at: String,
    updated_at: String,
    mapping_id: String,
    public_name: String,
    actual_name: String,
    modality: String,
}
