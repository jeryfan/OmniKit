use crate::error::AppError;
use axum::http::HeaderMap;

/// Extract the client's API token from request headers.
///
/// Accepts multiple authentication header formats to support clients using
/// different provider SDKs as the input format:
/// - `Authorization: Bearer <token>` (standard, OpenAI-compatible)
/// - `x-goog-api-key: <token>` (Google Gemini format)
/// - `x-api-key: <token>` (Anthropic format)
/// - `api-key: <token>` (Azure OpenAI format)
///
/// If the `Authorization` header is present, it must be in `Bearer <token>` form;
/// other header fallbacks are only tried when `Authorization` is absent.
pub fn extract_bearer_token(headers: &HeaderMap) -> Result<String, AppError> {
    // Priority 1: Authorization: Bearer (standard / OpenAI-compatible)
    if let Some(auth) = headers.get("authorization").and_then(|v| v.to_str().ok()) {
        if auth.starts_with("Bearer ") {
            return Ok(auth[7..].to_string());
        }
        return Err(AppError::Unauthorized("Invalid Authorization format".into()));
    }

    // Priority 2: x-goog-api-key (Google Gemini format)
    if let Some(key) = headers.get("x-goog-api-key").and_then(|v| v.to_str().ok()) {
        if !key.is_empty() {
            return Ok(key.to_string());
        }
    }

    // Priority 3: x-api-key (Anthropic format)
    if let Some(key) = headers.get("x-api-key").and_then(|v| v.to_str().ok()) {
        if !key.is_empty() {
            return Ok(key.to_string());
        }
    }

    // Priority 4: api-key (Azure OpenAI format)
    if let Some(key) = headers.get("api-key").and_then(|v| v.to_str().ok()) {
        if !key.is_empty() {
            return Ok(key.to_string());
        }
    }

    Err(AppError::Unauthorized("Missing Authorization header".into()))
}

/// Determine desired output format from headers or query params.
/// Returns None if not specified (meaning: same as input format).
pub fn extract_output_format(headers: &HeaderMap, query: Option<&str>) -> Option<String> {
    // Priority 1: X-Output-Format header
    if let Some(v) = headers.get("x-output-format").and_then(|v| v.to_str().ok()) {
        return Some(v.to_string());
    }

    // Priority 2: output_format query param
    if let Some(q) = query {
        for pair in q.split('&') {
            if let Some(val) = pair.strip_prefix("output_format=") {
                return Some(val.to_string());
            }
        }
    }

    None
}
