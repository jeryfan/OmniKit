use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Route {
    pub id: String,
    pub name: String,
    pub path_prefix: String,
    pub input_format: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RouteTarget {
    pub id: String,
    pub route_id: String,
    pub upstream_format: String,
    pub base_url: String,
    pub weight: i32,
    pub enabled: bool,
    pub key_rotation: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RouteTargetKey {
    pub id: String,
    pub target_id: String,
    pub key_value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RouteTargetOverride {
    pub id: String,
    pub target_id: String,
    pub scope: String,   // "body" | "header" | "query"
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Token {
    pub id: String,
    pub name: Option<String>,
    pub key_value: String,
    pub quota_limit: Option<i64>,
    pub quota_used: i64,
    pub expires_at: Option<String>,
    pub allowed_models: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RequestLog {
    pub id: String,
    pub token_id: Option<String>,
    pub route_id: Option<String>,
    pub target_id: Option<String>,
    pub model: Option<String>,
    pub modality: Option<String>,
    pub input_format: Option<String>,
    pub output_format: Option<String>,
    pub status: Option<i32>,
    pub latency_ms: Option<i64>,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub request_headers: Option<String>,
    pub response_headers: Option<String>,
    pub request_url: Option<String>,
    pub upstream_url: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct VideoRecord {
    pub id: String,
    pub url: String,
    pub title: String,
    pub cover_url: Option<String>,
    pub duration: Option<i64>,
    pub platform: String,
    pub formats: String,
    pub download_status: String,
    pub save_path: Option<String>,
    pub created_at: String,
}
