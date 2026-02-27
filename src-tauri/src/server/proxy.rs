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
    // Normalize: strip optional /v1 prefix to support both /v1/chat/completions and /chat/completions
    let normalized = path.strip_prefix("/v1").unwrap_or(path);
    if normalized == "/messages" || normalized.starts_with("/messages?") {
        Some("anthropic")
    } else if normalized == "/chat/completions" || normalized.starts_with("/chat/completions?") {
        Some("openai-chat")
    } else if normalized == "/responses" || normalized.starts_with("/responses?") {
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
            format!("{}/chat/completions", base)
        }
        ChatFormat::OpenaiResponses => {
            format!("{}/responses", base)
        }
        ChatFormat::Anthropic => {
            format!("{}/messages", base)
        }
        ChatFormat::Gemini => {
            if stream {
                format!("{}/models/{}:streamGenerateContent?alt=sse", base, model)
            } else {
                format!("{}/models/{}:generateContent", base, model)
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

/// 将覆盖规则应用到上游请求。
/// 返回 (修改后的请求体, 额外请求头列表, 修改后的URL)。
fn apply_overrides(
    body_bytes: &[u8],
    upstream_url: &str,
    overrides: &[crate::db::models::RouteTargetOverride],
) -> (Vec<u8>, Vec<(String, String)>, String) {
    if overrides.is_empty() {
        return (body_bytes.to_vec(), vec![], upstream_url.to_string());
    }

    let mut body_json: Option<serde_json::Value> = if !body_bytes.is_empty() {
        serde_json::from_slice(body_bytes).ok()
    } else {
        None
    };
    let mut extra_headers: Vec<(String, String)> = Vec::new();
    let mut modified_url = upstream_url.to_string();

    for ovr in overrides {
        match ovr.scope.as_str() {
            "body" => {
                if let Some(serde_json::Value::Object(ref mut map)) = body_json {
                    map.insert(ovr.key.clone(), serde_json::Value::String(ovr.value.clone()));
                }
            }
            "header" => {
                extra_headers.push((ovr.key.clone(), ovr.value.clone()));
            }
            "query" => {
                let sep = if modified_url.contains('?') { "&" } else { "?" };
                let k = urlencoding::encode(&ovr.key);
                let v = urlencoding::encode(&ovr.value);
                modified_url = format!("{}{}{}={}", modified_url, sep, k, v);
            }
            _ => {}
        }
    }

    let new_body = match body_json {
        Some(ref v) => serde_json::to_vec(v).unwrap_or_else(|_| body_bytes.to_vec()),
        None => body_bytes.to_vec(),
    };

    (new_body, extra_headers, modified_url)
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

    let request_url = match &query {
        Some(q) => format!("{}?{}", full_path, q),
        None => full_path.clone(),
    };

    if path_format_hint.is_some() && !is_passthrough {
        handle_format_conversion(
            &state, &route, &token.id, &headers, &body_bytes, &sub_path, &query, &request_url,
        )
        .await
    } else {
        handle_passthrough(&state, &route, &token.id, &headers, &body_bytes, &sub_path, &query, method, &request_url)
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
    request_url: &str,
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

    let (upstream_body, override_headers, upstream_url) =
        apply_overrides(&upstream_body, &upstream_url, &selected.overrides);

    let mut req_builder = state
        .http_client
        .post(&upstream_url)
        .header("Content-Type", "application/json")
        .body(upstream_body);
    req_builder = apply_auth(req_builder, upstream_format, api_key);
    for (k, v) in &override_headers {
        req_builder = req_builder.header(k.as_str(), v.as_str());
    }

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
                Some(request_url), Some(&upstream_url),
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
            Some(request_url), Some(&upstream_url),
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
            Some(request_url), Some(&upstream_url),
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
        Some(request_url), Some(&upstream_url),
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
    token_id: &str,
    headers: &HeaderMap,
    body_bytes: &[u8],
    sub_path: &str,
    query: &Option<String>,
    method: axum::http::Method,
    request_url: &str,
) -> Result<Response, AppError> {
    let start = std::time::Instant::now();

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

    let (body_owned, override_headers, target_url) =
        apply_overrides(body_bytes, &target_url, &selected.overrides);
    let body_bytes = body_owned.as_slice();

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
    } else if !api_key.is_empty() {
        // 透传模式但配置了上游 key：将原始请求中的 x-api-key 和 authorization 替换为配置的 key
        if headers.contains_key("x-api-key") {
            req_builder = req_builder.header("x-api-key", api_key.as_str());
        }
        if headers.contains_key("authorization") {
            let scheme = headers
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.splitn(2, ' ').next().filter(|p| p.len() < 20))
                .unwrap_or("Bearer");
            req_builder = req_builder.header("authorization", format!("{} {}", scheme, api_key));
        }
    }
    for (k, v) in &override_headers {
        req_builder = req_builder.header(k.as_str(), v.as_str());
    }

    if !body_bytes.is_empty() {
        req_builder = req_builder.body(body_bytes.to_vec());
    }

    let request_body_str = String::from_utf8_lossy(body_bytes).to_string();
    let req_headers_json = headers_to_json(headers);
    let target_id = target.id.clone();
    let route_id = route.id.clone();
    let upstream_format_str = target.upstream_format.clone();

    let upstream_resp = match req_builder.send().await {
        Ok(r) => r,
        Err(e) => {
            let latency = start.elapsed().as_millis() as i64;
            log_request(
                &state.db, token_id, &route_id, &target_id, "", "passthrough",
                &route.input_format, &upstream_format_str, None, latency, None, None,
                Some(&request_body_str), Some(&e.to_string()),
                req_headers_json.as_deref(), None,
                Some(request_url), Some(&target_url),
            ).await;
            return Err(AppError::HttpClient(e));
        }
    };

    let status = upstream_resp.status();
    let resp_headers = upstream_resp.headers().clone();
    let resp_headers_json = headers_to_json(&resp_headers);

    let content_type = resp_headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let is_streaming = content_type.contains("text/event-stream");

    if is_streaming {
        let latency = start.elapsed().as_millis() as i64;
        let log_id = log_request(
            &state.db, token_id, &route_id, &target_id, "", "passthrough",
            &route.input_format, &upstream_format_str, Some(status.as_u16() as i32),
            latency, None, None, Some(&request_body_str), None,
            req_headers_json.as_deref(), resp_headers_json.as_deref(),
            Some(request_url), Some(&target_url),
        ).await;

        let byte_stream = upstream_resp.bytes_stream();
        let db_for_stream = state.db.clone();

        let capturing_stream = async_stream::stream! {
            let mut full_body: Vec<u8> = Vec::new();
            let mut byte_stream = Box::pin(byte_stream);
            loop {
                match byte_stream.next().await {
                    Some(Ok(chunk)) => {
                        full_body.extend_from_slice(&chunk);
                        yield Ok::<_, std::convert::Infallible>(chunk);
                    }
                    Some(Err(e)) => {
                        log::error!("Passthrough stream error: {}", e);
                        break;
                    }
                    None => break,
                }
            }
            if !full_body.is_empty() {
                let body_str = String::from_utf8_lossy(&full_body).to_string();
                let _ = sqlx::query("UPDATE request_logs SET response_body = ? WHERE id = ?")
                    .bind(&body_str)
                    .bind(&log_id)
                    .execute(&db_for_stream)
                    .await;
            }
        };

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
        return Ok(resp.body(Body::from_stream(capturing_stream)).unwrap());
    }

    let resp_bytes = upstream_resp.bytes().await.unwrap_or_default();
    let latency = start.elapsed().as_millis() as i64;
    let resp_body_str = String::from_utf8_lossy(&resp_bytes).to_string();
    log_request(
        &state.db, token_id, &route_id, &target_id, "", "passthrough",
        &route.input_format, &upstream_format_str, Some(status.as_u16() as i32),
        latency, None, None, Some(&request_body_str), Some(&resp_body_str),
        req_headers_json.as_deref(), resp_headers_json.as_deref(),
        Some(request_url), Some(&target_url),
    ).await;

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
    request_url: Option<&str>,
    upstream_url: Option<&str>,
) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "INSERT INTO request_logs (id, token_id, route_id, target_id, model, modality, input_format, output_format, status, latency_ms, prompt_tokens, completion_tokens, request_body, response_body, request_headers, response_headers, request_url, upstream_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id).bind(token_id).bind(route_id).bind(target_id)
    .bind(model).bind(modality).bind(input_format).bind(output_format)
    .bind(status).bind(latency_ms).bind(prompt_tokens).bind(completion_tokens)
    .bind(request_body).bind(response_body)
    .bind(request_headers).bind(response_headers)
    .bind(request_url).bind(upstream_url)
    .bind(&now)
    .execute(db).await;

    if let Err(e) = result {
        log::error!("Failed to log request: {}", e);
    }
    id
}
