pub mod config;
pub mod channels;
pub mod tokens;
pub mod model_mappings;
pub mod request_logs;
pub mod proxy;
pub mod rules;

#[derive(serde::Serialize)]
pub struct PaginatedResult<T: serde::Serialize> {
    pub items: Vec<T>,
    pub total: i64,
}
