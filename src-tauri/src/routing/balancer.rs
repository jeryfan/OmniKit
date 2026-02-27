use crate::db::models::{RouteTarget, RouteTargetKey};
use crate::error::AppError;
use crate::routing::circuit::CircuitBreaker;
use rand::Rng;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

/// Holds round-robin counters for key rotation, keyed by target_id.
pub struct KeyRotationState {
    counters: Mutex<HashMap<String, AtomicUsize>>,
}

impl KeyRotationState {
    pub fn new() -> Self {
        Self {
            counters: Mutex::new(HashMap::new()),
        }
    }

    /// Get the next key index for a target using round-robin.
    pub fn next_index(&self, target_id: &str, key_count: usize) -> usize {
        if key_count == 0 {
            return 0;
        }
        let mut counters = self.counters.lock().unwrap();
        let counter = counters
            .entry(target_id.to_string())
            .or_insert_with(|| AtomicUsize::new(0));
        counter.fetch_add(1, Ordering::Relaxed) % key_count
    }
}

pub struct SelectedTarget {
    pub target: RouteTarget,
    pub api_key: String,
}

/// Select the best available target for a route.
pub async fn select_target(
    route_id: &str,
    db: &SqlitePool,
    circuit: &CircuitBreaker,
    rotation: &KeyRotationState,
) -> Result<SelectedTarget, AppError> {
    let targets = sqlx::query_as::<_, RouteTarget>(
        "SELECT * FROM route_targets WHERE route_id = ? AND enabled = 1",
    )
    .bind(route_id)
    .fetch_all(db)
    .await?;

    if targets.is_empty() {
        return Err(AppError::NoTarget(route_id.to_string()));
    }

    // Filter by circuit breaker
    let available: Vec<&RouteTarget> = targets
        .iter()
        .filter(|t| circuit.is_available(&t.id))
        .collect();

    if available.is_empty() {
        return Err(AppError::NoTarget(route_id.to_string()));
    }

    // Weighted random selection
    let target = weighted_random_select(&available);

    // Fetch enabled keys for this target
    let keys = sqlx::query_as::<_, RouteTargetKey>(
        "SELECT * FROM route_target_keys WHERE target_id = ? AND enabled = 1",
    )
    .bind(&target.id)
    .fetch_all(db)
    .await?;

    // Pick key; allow empty keys for passthrough targets (upstream_format = "none")
    let api_key = if keys.is_empty() {
        String::new()
    } else if target.key_rotation {
        let idx = rotation.next_index(&target.id, keys.len());
        keys[idx].key_value.clone()
    } else {
        keys[0].key_value.clone()
    };

    Ok(SelectedTarget {
        target: target.clone(),
        api_key,
    })
}

fn weighted_random_select<'a>(targets: &[&'a RouteTarget]) -> &'a RouteTarget {
    if targets.len() == 1 {
        return targets[0];
    }

    let total_weight: i32 = targets.iter().map(|t| t.weight.max(1)).sum();
    let mut rng = rand::rng();
    let mut pick = rng.random_range(0..total_weight);

    for t in targets {
        pick -= t.weight.max(1);
        if pick < 0 {
            return t;
        }
    }

    targets.last().unwrap()
}
