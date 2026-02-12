use axum::http::StatusCode;
use axum::response::{IntoResponse, Json, Response};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Invalid request: {0}")]
    BadRequest(String),

    #[error("Authentication failed: {0}")]
    Unauthorized(String),

    #[error("Channel not found for model: {0}")]
    NoChannel(String),

    #[error("All channels failed for model: {0}")]
    AllChannelsFailed(String),

    #[error("Upstream error: {status} {body}")]
    Upstream { status: u16, body: String },

    #[error("Codec error: {0}")]
    Codec(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("HTTP client error: {0}")]
    HttpClient(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::NoChannel(_) => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::AllChannelsFailed(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
            AppError::Upstream { status, .. } => (
                StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY),
                self.to_string(),
            ),
            AppError::Codec(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error".into()),
            AppError::HttpClient(_) => (StatusCode::BAD_GATEWAY, self.to_string()),
            AppError::Json(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
        };

        let body = Json(json!({
            "error": {
                "message": message,
                "type": format!("{:?}", status),
            }
        }));

        (status, body).into_response()
    }
}
