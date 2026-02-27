pub mod config;
pub mod routes;
pub mod tokens;
pub mod request_logs;
pub mod proxy;
pub mod rules;
pub mod video;

#[derive(serde::Serialize)]
pub struct PaginatedResult<T: serde::Serialize> {
    pub items: Vec<T>,
    pub total: i64,
}
