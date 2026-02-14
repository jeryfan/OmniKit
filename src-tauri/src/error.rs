use axum::http::StatusCode;
use axum::response::{IntoResponse, Json, Response};
use serde::Serialize;
use serde_json::json;
use thiserror::Error;

// === IPC Error type for Tauri commands ===

#[derive(Debug, Clone, Serialize)]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

impl IpcError {
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self { code: "NOT_FOUND".into(), message: msg.into() }
    }

    pub fn validation(msg: impl Into<String>) -> Self {
        Self { code: "VALIDATION".into(), message: msg.into() }
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self { code: "INTERNAL".into(), message: msg.into() }
    }
}

impl From<sqlx::Error> for IpcError {
    fn from(e: sqlx::Error) -> Self {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.code().as_deref() == Some("2067") {
                return Self { code: "CONFLICT".into(), message: db_err.message().to_string() };
            }
        }
        Self { code: "DB_ERROR".into(), message: e.to_string() }
    }
}

impl From<reqwest::Error> for IpcError {
    fn from(e: reqwest::Error) -> Self {
        Self { code: "INTERNAL".into(), message: e.to_string() }
    }
}

impl From<serde_json::Error> for IpcError {
    fn from(e: serde_json::Error) -> Self {
        Self { code: "VALIDATION".into(), message: e.to_string() }
    }
}

// === HTTP AppError for Axum handlers ===

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
