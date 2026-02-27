use crate::db::models::{Route, Token};
use crate::error::AppError;
use crate::modality::chat::{self, ChatFormat};
use crate::routing::balancer::{self, KeyRotationState};
use crate::routing::circuit::CircuitBreaker;
use crate::server::middleware;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::Response;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio_stream::StreamExt;

#[derive(Clone)]
pub struct ProxyState {
    pub db: SqlitePool,
    pub http_client: reqwest::Client,
    pub circuit: Arc<CircuitBreaker>,
    pub rotation: Arc<KeyRotationState>,
}

fn detect_chat_format_from_path(path: &str) -> Option<&'static str> {
    if path == "/v1/messages" || path.starts_with("/v1/messages?") {
        Some("anthropic")
    } else if path == "/v1/chat/completions" || path.starts_with("/v1/chat/completions?") {
        Some("openai-chat")
    } else if path == "/v1/responses" || path.starts_with("/v1/responses?") {
        Some("openai-responses")
    } else {
        None
    }
}

fn resolve_decoder(slug: &str) -> Result<Box<dyn chat::Decoder>, AppError> {
    ChatFormat::from_str_loose(slug)
        .map(chat::get_decoder)
        .ok_or_else(|| AppError::Codec(format!("Unknown format: {}", slug)))
}

fn resolve_encoder(slug: &str) -> Result<Box<dyn chat::Encoder>, AppError> {
    ChatFormat::from_str_loose(slug)
        .map(chat::get_encoder)
        .ok_or_else(|| AppError::Codec(format!("Unknown format: {}", slug)))
}

fn build_upstream_url(base_url: &str, format: ChatFormat, model: &str, stream: bool) -> String {
    let base = base_url.trim_end_matches('/');
    match format {
        ChatFormat::OpenaiChat | ChatFormat::Moonshot => {
            format!("{}/v1/chat/completions", base)
        }
        ChatFormat::OpenaiResponses => {
            format!("{}/v1/responses", base)
        }
        ChatFormat::Anthropic => {
            format!("{}/v1/messages", base)
        }
        ChatFormat::Gemini => {
            if stream {
                format!(
                    "{}/v1beta/models/{}:streamGenerateContent?alt=sse",
                    base, model
                )
            } else {
                format!("{}/v1beta/models/{}:generateContent", base, model)
            }
        }
    }
}

fn apply_auth(
    builder: reqwest::RequestBuilder,
    format: ChatFormat,
    api_key: &str,
) -> reqwest::RequestBuilder {
    match format {
        ChatFormat::OpenaiChat | ChatFormat::OpenaiResponses | ChatFormat::Moonshot => {
            builder.header("Authorization", format!("Bearer {}", api_key))
        }
        ChatFormat::Anthropic => builder
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        ChatFormat::Gemini => builder.header("x-goog-api-key", api_key),
    }
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
    "authorization",
    "x-api-key",
    "anthropic-version",
    "x-goog-api-key",
];

fn headers_to_json(headers: &HeaderMap) -> Option<String> {
    let mut map = serde_json::Map::new();
    for (k, v) in headers.iter() {
        if let Ok(v_str) = v.to_str() {
            map.insert(k.as_str().to_string(), serde_json::Value::String(v_str.to_string()));
        }
    }
    if map.is_empty() {
        None
    } else {
        serde_json::to_string(&map).ok()
    }
}

/// Main handler for all route-based proxy requests.
pub async fn handle_route_proxy(
    State(state): State<ProxyState>,
    req: Request,
) -> Result<Response, AppError> {
    let full_path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| q.to_string());
    let method = req.method().clone();
    let (parts, body) = req.into_parts();
    let headers = parts.headers;

    // Extract path prefix (first segment: "/anthropic" from "/anthropic/v1/messages")
    let path_prefix = extract_prefix(&full_path);

    // Look up route by path_prefix
    let route = sqlx::query_as::<_, Route>(
        "SELECT * FROM routes WHERE path_prefix = ? AND enabled = 1",
    )
    .bind(&path_prefix)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NoRoute(path_prefix.clone()))?;

    // Authenticate token
    let token_value = middleware::extract_bearer_token(&headers)?;
    let token = sqlx::query_as::<_, Token>(
        "SELECT * FROM tokens WHERE key_value = ? AND enabled = 1",
    )
    .bind(&token_value)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid API key".into()))?;

    if let Some(expires) = &token.expires_at {
        let now = chrono::Utc::now().naive_utc().to_string();
        if *expires < now {
            return Err(AppError::Unauthorized("API key expired".into()));
        }
    }

    // Strip prefix to get the sub-path
    let sub_path = strip_prefix(&full_path, &path_prefix);

    // Read body bytes
    let body_bytes = axum::body::to_bytes(body, 32 * 1024 * 1024)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read body: {}", e)))?;

    // Check if this path needs format conversion
    let path_format_hint = detect_chat_format_from_path(&sub_path);
    let is_passthrough = route.input_format == "none" || route.input_format.is_empty();

    if path_format_hint.is_some() && !is_passthrough {
        handle_format_conversion(
            &state, &route, &token.id, &headers, &body_bytes, &sub_path, &query,
        )
        .await
    } else {
        handle_passthrough(&state, &route, &headers, &body_bytes, &sub_path, &query, method)
            .await
    }
}

/// Handle requests that need format conversion (known codec paths).
async fn handle_format_conversion(
    state: &ProxyState,
    route: &Route,
    token_id: &str,
    headers: &HeaderMap,
    body_bytes: &[u8],
    _sub_path: &str,
    _query: &Option<String>,
) -> Result<Response, AppError> {
    let start = std::time::Instant::now();

    let decoder = resolve_decoder(&route.input_format)?;
    let ir = decoder.decode_request(body_bytes)?;

    let model = ir.model.clone();
    let input_fmt_str = route.input_format.clone();

    let selected = balancer::select_target(
        &route.id,
        &state.db,
        &state.circuit,
        &state.rotation,
    )
    .await?;

    let target = &selected.target;
    let api_key = &selected.api_key;
    let upstream_slug = target.upstream_format.clone();
    let output_fmt_str = upstream_slug.clone();

    let upstream_encoder = resolve_encoder(&upstream_slug)?;
    let upstream_body = upstream_encoder.encode_request(&ir, &ir.model)?;

    let upstream_format = ChatFormat::from_str_loose(&upstream_slug)
        .ok_or_else(|| AppError::Codec(format!("Unknown upstream format: {}", upstream_slug)))?;
    let upstream_url = build_upstream_url(&target.base_url, upstream_format, &ir.model, ir.stream);

    let mut req_builder = state
        .http_client
        .post(&upstream_url)
        .header("Content-Type", "application/json")
        .body(upstream_body);
    req_builder = apply_auth(req_builder, upstream_format, api_key);

    let request_body_str = String::from_utf8_lossy(body_bytes).to_string();
    let req_headers_json = headers_to_json(headers);
    let target_id = target.id.clone();
    let route_id = route.id.clone();

    let upstream_resp = req_builder.send().await;
    let upstream_resp = match upstream_resp {
        Ok(r) => r,
        Err(e) => {
            state.circuit.record_failure(&target.id);
            let latency = start.elapsed().as_millis() as i64;
            log_request(
                &state.db, token_id, &route_id, &target_id, &model, "chat",
                &input_fmt_str, &output_fmt_str, None, latency, None, None,
                Some(&request_body_str), Some(&e.to_string()),
                req_headers_json.as_deref(), None,
            ).await;
            return Err(AppError::HttpClient(e));
        }
    };

    let status = upstream_resp.status();
    if !status.is_success() {
        state.circuit.record_failure(&target.id);
        let resp_headers_json = headers_to_json(upstream_resp.headers());
        let error_body = upstream_resp.text().await.unwrap_or_default();
        let latency = start.elapsed().as_millis() as i64;
        log_request(
            &state.db, token_id, &route_id, &target_id, &model, "chat",
            &input_fmt_str, &output_fmt_str, Some(status.as_u16() as i32),
            latency, None, None, Some(&request_body_str), Some(&error_body),
            req_headers_json.as_deref(), resp_headers_json.as_deref(),
        ).await;
        return Err(AppError::Upstream { status: status.as_u16(), body: error_body });
    }

    state.circuit.record_success(&target.id);

    if ir.stream {
        let resp_headers_json = headers_to_json(upstream_resp.headers());
        let latency = start.elapsed().as_millis() as i64;
        let log_id = log_request(
            &state.db, token_id, &route_id, &target_id, &model, "chat",
            &input_fmt_str, &output_fmt_str, Some(200), latency, None, None,
            Some(&request_body_str), None,
            req_headers_json.as_deref(), resp_headers_json.as_deref(),
        ).await;
        return proxy_stream(
            upstream_resp,
            upstream_slug.clone(),
            route.input_format.clone(),
            state.db.clone(),
            log_id,
        ).await;
    }

    let resp_headers_json = headers_to_json(upstream_resp.headers());
    let resp_bytes = upstream_resp.bytes().await?;
    let upstream_decoder = resolve_decoder(&upstream_slug)?;
    let ir_response = upstream_decoder.decode_response(&resp_bytes)?;
    let output_encoder = resolve_encoder(&route.input_format)?;
    let output_bytes = output_encoder.encode_response(&ir_response)?;

    let latency = start.elapsed().as_millis() as i64;
    let prompt_tokens = ir_response.usage.as_ref().map(|u| u.prompt_tokens as i64);
    let completion_tokens = ir_response.usage.as_ref().map(|u| u.completion_tokens as i64);
    let resp_body_str = String::from_utf8_lossy(&output_bytes).to_string();

    log_request(
        &state.db, token_id, &route_id, &target_id, &model, "chat",
        &input_fmt_str, &output_fmt_str, Some(200), latency,
        prompt_tokens, completion_tokens,
        Some(&request_body_str), Some(&resp_body_str),
        req_headers_json.as_deref(), resp_headers_json.as_deref(),
    ).await;

    if let (Some(pt), Some(ct)) = (prompt_tokens, completion_tokens) {
        let _ = sqlx::query("UPDATE tokens SET quota_used = quota_used + ? WHERE id = ?")
            .bind(pt + ct)
            .bind(token_id)
            .execute(&state.db)
            .await;
    }

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Body::from(output_bytes))
        .unwrap())
}

/// Passthrough: strip prefix, replace auth, forward as-is.
async fn handle_passthrough(
    state: &ProxyState,
    route: &Route,
    headers: &HeaderMap,
    body_bytes: &[u8],
    sub_path: &str,
    query: &Option<String>,
    method: axum::http::Method,
) -> Result<Response, AppError> {
    let selected = balancer::select_target(
        &route.id,
        &state.db,
        &state.circuit,
        &state.rotation,
    )
    .await?;

    let target = &selected.target;
    let api_key = &selected.api_key;

    let base = target.base_url.trim_end_matches('/');
    let target_url = match query {
        Some(q) => format!("{}{}?{}", base, sub_path, q),
        None => format!("{}{}", base, sub_path),
    };

    let upstream_format = ChatFormat::from_str_loose(&target.upstream_format);

    let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .map_err(|_| AppError::BadRequest(format!("Unsupported method: {}", method)))?;

    let mut req_builder = state.http_client.request(reqwest_method, &target_url);

    for (name, value) in headers.iter() {
        let name_lower = name.as_str().to_lowercase();
        if HOP_BY_HOP.contains(&name_lower.as_str()) {
            continue;
        }
        if let Ok(v) = value.to_str() {
            req_builder = req_builder.header(name.as_str(), v);
        }
    }

    if let Some(format) = upstream_format {
        req_builder = apply_auth(req_builder, format, api_key);
    }

    if !body_bytes.is_empty() {
        req_builder = req_builder.body(body_bytes.to_vec());
    }

    let upstream_resp = req_builder.send().await.map_err(AppError::HttpClient)?;

    let status = upstream_resp.status();
    let resp_headers = upstream_resp.headers().clone();

    let content_type = resp_headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let is_streaming = content_type.contains("text/event-stream");

    if is_streaming {
        let byte_stream = upstream_resp.bytes_stream();
        let mut resp = Response::builder().status(status);
        for (name, value) in resp_headers.iter() {
            if HOP_BY_HOP.contains(&name.as_str().to_lowercase().as_str()) {
                continue;
            }
            if let (Ok(hn), Ok(hv)) = (
                HeaderName::from_bytes(name.as_str().as_bytes()),
                HeaderValue::from_bytes(value.as_bytes()),
            ) {
                resp = resp.header(hn, hv);
            }
        }
        return Ok(resp.body(Body::from_stream(byte_stream)).unwrap());
    }

    let resp_bytes = upstream_resp.bytes().await.unwrap_or_default();
    let mut resp = Response::builder().status(status);
    for (name, value) in resp_headers.iter() {
        if HOP_BY_HOP.contains(&name.as_str().to_lowercase().as_str()) {
            continue;
        }
        if let (Ok(hn), Ok(hv)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            resp = resp.header(hn, hv);
        }
    }
    Ok(resp.body(Body::from(resp_bytes)).unwrap())
}

fn extract_prefix(path: &str) -> String {
    let trimmed = path.trim_start_matches('/');
    let first_segment = trimmed.split('/').next().unwrap_or("");
    format!("/{}", first_segment)
}

fn strip_prefix(path: &str, prefix: &str) -> String {
    let prefix_trimmed = prefix.trim_end_matches('/');
    match path.strip_prefix(prefix_trimmed) {
        Some("") => "/".to_string(),
        Some(rest) => rest.to_string(),
        None => path.to_string(),
    }
}

async fn proxy_stream(
    upstream_resp: reqwest::Response,
    upstream_slug: String,
    output_slug: String,
    db: SqlitePool,
    log_id: String,
) -> Result<Response, AppError> {
    let upstream_decoder = resolve_decoder(&upstream_slug)?;
    let output_encoder = resolve_encoder(&output_slug)?;

    let byte_stream = upstream_resp.bytes_stream();

    let sse_stream = async_stream::stream! {
        let mut buffer = String::new();
        let mut byte_stream = Box::pin(byte_stream);
        let mut response_body = String::new();
        let mut has_response_chunk = false;
        let mut stream_done = false;

        while !stream_done {
            let chunk_result = match byte_stream.next().await {
                Some(c) => c,
                None => break,
            };
            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Upstream stream error: {}", e);
                    break;
                }
            };

            match std::str::from_utf8(&chunk) {
                Ok(text) => buffer.push_str(text),
                Err(_) => buffer.push_str(&String::from_utf8_lossy(&chunk)),
            }

            while let Some(pos) = buffer.find("\n\n") {
                let event_block = buffer[..pos].to_owned();
                buffer.drain(..pos + 2);

                for line in event_block.lines() {
                    let data = if let Some(d) = line.strip_prefix("data: ") {
                        d.trim()
                    } else if let Some(d) = line.strip_prefix("data:") {
                        d.trim()
                    } else {
                        continue;
                    };

                    if upstream_decoder.is_stream_done(data) {
                        if let Some(done) = output_encoder.stream_done_signal() {
                            yield Ok::<_, std::convert::Infallible>(
                                format!("data: {}\n\n", done)
                            );
                        }
                        stream_done = true;
                        break;
                    }

                    match upstream_decoder.decode_stream_chunk(data) {
                        Ok(Some(ir_chunk)) => {
                            match output_encoder.encode_stream_chunk(&ir_chunk) {
                                Ok(Some(encoded)) => {
                                    if has_response_chunk {
                                        response_body.push(',');
                                    } else {
                                        response_body.push('[');
                                        has_response_chunk = true;
                                    }
                                    response_body.push_str(&encoded);
                                    yield Ok(format!("data: {}\n\n", encoded));
                                }
                                Ok(None) => {}
                                Err(e) => { log::error!("Encode stream chunk error: {}", e); }
                            }
                        }
                        Ok(None) => {}
                        Err(e) => { log::error!("Decode stream chunk error: {}", e); }
                    }
                }
                if stream_done { break; }
            }
        }

        if has_response_chunk {
            response_body.push(']');
            let _ = sqlx::query("UPDATE request_logs SET response_body = ? WHERE id = ?")
                .bind(&response_body)
                .bind(&log_id)
                .execute(&db)
                .await;
        }
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(Body::from_stream(sse_stream))
        .unwrap())
}

#[allow(clippy::too_many_arguments)]
async fn log_request(
    db: &SqlitePool,
    token_id: &str,
    route_id: &str,
    target_id: &str,
    model: &str,
    modality: &str,
    input_format: &str,
    output_format: &str,
    status: Option<i32>,
    latency_ms: i64,
    prompt_tokens: Option<i64>,
    completion_tokens: Option<i64>,
    request_body: Option<&str>,
    response_body: Option<&str>,
    request_headers: Option<&str>,
    response_headers: Option<&str>,
) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "INSERT INTO request_logs (id, token_id, route_id, target_id, model, modality, input_format, output_format, status, latency_ms, prompt_tokens, completion_tokens, request_body, response_body, request_headers, response_headers, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(token_id).bind(route_id).bind(target_id)
    .bind(model).bind(modality).bind(input_format).bind(output_format)
    .bind(status).bind(latency_ms).bind(prompt_tokens).bind(completion_tokens)
    .bind(request_body).bind(response_body)
    .bind(request_headers).bind(response_headers)
    .bind(&now)
    .execute(db).await;

    if let Err(e) = result {
        log::error!("Failed to log request: {}", e);
    }
    id
}
