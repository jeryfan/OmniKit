use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Channel {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub priority: i32,
    pub weight: i32,
    pub enabled: bool,
    pub key_rotation: bool,
    pub rate_limit: Option<String>,
    pub test_url: Option<String>,
    pub test_headers: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChannelApiKey {
    pub id: String,
    pub channel_id: String,
    pub key_value: String,
    pub enabled: bool,
    pub last_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelMapping {
    pub id: String,
    pub public_name: String,
    pub channel_id: String,
    pub actual_name: String,
    pub modality: String,
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
    pub channel_id: Option<String>,
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
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProxyRule {
    pub id: String,
    pub name: String,
    pub path_prefix: String,
    pub target_base_url: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProxyLog {
    pub id: String,
    pub rule_id: String,
    pub method: String,
    pub url: String,
    pub request_headers: Option<String>,
    pub request_body: Option<String>,
    pub status: Option<i32>,
    pub response_headers: Option<String>,
    pub response_body: Option<String>,
    pub latency_ms: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ConversionRule {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub version: String,
    pub tags: Option<String>,
    pub rule_type: String,
    pub modality: String,
    pub decode_request: String,
    pub encode_request: String,
    pub decode_response: String,
    pub encode_response: String,
    pub decode_stream_chunk: Option<String>,
    pub encode_stream_chunk: Option<String>,
    pub http_config: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
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
