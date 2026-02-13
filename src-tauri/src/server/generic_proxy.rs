use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::response::Response;
use sqlx::SqlitePool;

use crate::db::models::ProxyRule;
use crate::error::AppError;

#[derive(Clone)]
pub struct GenericProxyState {
    pub db: SqlitePool,
    pub http_client: reqwest::Client,
}

const HOP_BY_HOP: &[&str] = &[
    "host",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
];

pub async fn handle_generic_proxy(
    State(state): State<GenericProxyState>,
    req: Request,
) -> Result<Response, AppError> {
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| q.to_string());

    // Find matching rule by longest prefix match
    let rules: Vec<ProxyRule> = sqlx::query_as(
        "SELECT * FROM proxy_rules WHERE enabled = 1 ORDER BY LENGTH(path_prefix) DESC",
    )
    .fetch_all(&state.db)
    .await?;

    let matched = rules.iter().find(|r| {
        let prefix = r.path_prefix.trim_end_matches('/');
        path == prefix || path.starts_with(&format!("{}/", prefix))
    });

    let rule = match matched {
        Some(r) => r.clone(),
        None => {
            return Ok(Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("Not Found"))
                .unwrap());
        }
    };

    let start = std::time::Instant::now();
    let method = req.method().clone();

    // Strip the path_prefix to get the remaining path
    let prefix = rule.path_prefix.trim_end_matches('/');
    let remaining = path.strip_prefix(prefix).unwrap_or("");
    let remaining = if remaining.is_empty() { "/" } else { remaining };

    // Build target URL
    let base = rule.target_base_url.trim_end_matches('/');
    let target_url = match &query {
        Some(q) => format!("{}{}?{}", base, remaining, q),
        None => format!("{}{}", base, remaining),
    };

    // Extract request headers and body
    let (parts, body) = req.into_parts();
    let req_headers = parts.headers;
    let body_bytes = axum::body::to_bytes(body, 10 * 1024 * 1024)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read body: {}", e)))?;

    let req_headers_json = serialize_headers(&req_headers);
    let req_body_str = if body_bytes.is_empty() {
        None
    } else {
        Some(String::from_utf8_lossy(&body_bytes).to_string())
    };

    // Build upstream request
    let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .map_err(|_| AppError::BadRequest(format!("Unsupported HTTP method: {}", method)))?;

    let mut upstream_req = state.http_client.request(reqwest_method, &target_url);

    // Forward headers (skip hop-by-hop)
    for (name, value) in req_headers.iter() {
        let name_lower = name.as_str().to_lowercase();
        if HOP_BY_HOP.contains(&name_lower.as_str()) {
            continue;
        }
        if let Ok(v) = value.to_str() {
            upstream_req = upstream_req.header(name.as_str(), v);
        }
    }

    if !body_bytes.is_empty() {
        upstream_req = upstream_req.body(body_bytes.clone());
    }

    // Send upstream request
    let upstream_resp = upstream_req.send().await;

    match upstream_resp {
        Ok(resp) => {
            let status = resp.status();
            let resp_headers = resp.headers().clone();
            let resp_headers_json = serialize_reqwest_headers(&resp_headers);

            let content_type = resp_headers
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            let is_streaming = content_type.contains("text/event-stream")
                || content_type.contains("application/x-ndjson");

            if is_streaming {
                let latency = start.elapsed().as_millis() as i64;
                let log_id = uuid::Uuid::new_v4().to_string();
                log_proxy_request(
                    &state.db,
                    &log_id,
                    &rule.id,
                    method.as_str(),
                    &target_url,
                    req_headers_json.as_deref(),
                    req_body_str.as_deref(),
                    Some(status.as_u16() as i32),
                    resp_headers_json.as_deref(),
                    None,
                    latency,
                )
                .await;

                let byte_stream = resp.bytes_stream();
                let stream_body = Body::from_stream(byte_stream);

                let mut response = Response::builder().status(status);
                for (name, value) in resp_headers.iter() {
                    let name_lower = name.as_str().to_lowercase();
                    if HOP_BY_HOP.contains(&name_lower.as_str()) {
                        continue;
                    }
                    if let (Ok(hn), Ok(hv)) = (
                        HeaderName::from_bytes(name.as_str().as_bytes()),
                        HeaderValue::from_bytes(value.as_bytes()),
                    ) {
                        response = response.header(hn, hv);
                    }
                }
                Ok(response.body(stream_body).unwrap())
            } else {
                let resp_body_bytes = resp.bytes().await.unwrap_or_default();
                let latency = start.elapsed().as_millis() as i64;
                let resp_body_str = if resp_body_bytes.is_empty() {
                    None
                } else {
                    Some(String::from_utf8_lossy(&resp_body_bytes).to_string())
                };

                let log_id = uuid::Uuid::new_v4().to_string();
                log_proxy_request(
                    &state.db,
                    &log_id,
                    &rule.id,
                    method.as_str(),
                    &target_url,
                    req_headers_json.as_deref(),
                    req_body_str.as_deref(),
                    Some(status.as_u16() as i32),
                    resp_headers_json.as_deref(),
                    resp_body_str.as_deref(),
                    latency,
                )
                .await;

                let mut response = Response::builder().status(status);
                for (name, value) in resp_headers.iter() {
                    let name_lower = name.as_str().to_lowercase();
                    if HOP_BY_HOP.contains(&name_lower.as_str()) {
                        continue;
                    }
                    if let (Ok(hn), Ok(hv)) = (
                        HeaderName::from_bytes(name.as_str().as_bytes()),
                        HeaderValue::from_bytes(value.as_bytes()),
                    ) {
                        response = response.header(hn, hv);
                    }
                }
                Ok(response.body(Body::from(resp_body_bytes)).unwrap())
            }
        }
        Err(e) => {
            let latency = start.elapsed().as_millis() as i64;
            let log_id = uuid::Uuid::new_v4().to_string();
            log_proxy_request(
                &state.db,
                &log_id,
                &rule.id,
                method.as_str(),
                &target_url,
                req_headers_json.as_deref(),
                req_body_str.as_deref(),
                None,
                None,
                Some(&e.to_string()),
                latency,
            )
            .await;
            Err(AppError::HttpClient(e))
        }
    }
}

fn serialize_headers(headers: &axum::http::HeaderMap) -> Option<String> {
    let mut map = serde_json::Map::new();
    for (name, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            map.insert(
                name.as_str().to_string(),
                serde_json::Value::String(v.to_string()),
            );
        }
    }
    if map.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(map).to_string())
    }
}

fn serialize_reqwest_headers(headers: &reqwest::header::HeaderMap) -> Option<String> {
    let mut map = serde_json::Map::new();
    for (name, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            map.insert(
                name.as_str().to_string(),
                serde_json::Value::String(v.to_string()),
            );
        }
    }
    if map.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(map).to_string())
    }
}

#[allow(clippy::too_many_arguments)]
async fn log_proxy_request(
    db: &SqlitePool,
    id: &str,
    rule_id: &str,
    method: &str,
    url: &str,
    request_headers: Option<&str>,
    request_body: Option<&str>,
    status: Option<i32>,
    response_headers: Option<&str>,
    response_body: Option<&str>,
    latency_ms: i64,
) {
    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "INSERT INTO proxy_logs (id, rule_id, method, url, request_headers, request_body, status, response_headers, response_body, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id)
    .bind(rule_id)
    .bind(method)
    .bind(url)
    .bind(request_headers)
    .bind(request_body)
    .bind(status)
    .bind(response_headers)
    .bind(response_body)
    .bind(latency_ms)
    .bind(&now)
    .execute(db)
    .await;

    if let Err(e) = result {
        log::error!("Failed to log proxy request: {}", e);
    }
}
