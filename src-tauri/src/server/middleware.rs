use crate::error::AppError;
use axum::http::HeaderMap;

/// Extract and validate the Bearer token from request headers.
/// Returns the raw token string (without "Bearer " prefix).
pub fn extract_bearer_token(headers: &HeaderMap) -> Result<String, AppError> {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing Authorization header".into()))?;

    if !auth.starts_with("Bearer ") {
        return Err(AppError::Unauthorized("Invalid Authorization format".into()));
    }

    Ok(auth[7..].to_string())
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
