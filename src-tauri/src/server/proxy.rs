use crate::error::AppError;
use crate::modality::chat::{self, ChatFormat};
use crate::routing::balancer;
use crate::routing::circuit::CircuitBreaker;
use crate::server::middleware;
use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use bytes::Bytes;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio_stream::StreamExt;

#[derive(Clone)]
pub struct ProxyState {
    pub db: SqlitePool,
    pub http_client: reqwest::Client,
    pub circuit: Arc<CircuitBreaker>,
}

/// Main proxy handler for chat completion requests.
/// The `input_format` is determined from the route path.
pub async fn proxy_chat(
    State(state): State<ProxyState>,
    headers: HeaderMap,
    input_format: ChatFormat,
    body: Bytes,
) -> Result<Response, AppError> {
    let start = std::time::Instant::now();

    // 1. Authenticate
    let token_value = middleware::extract_bearer_token(&headers)?;
    let token = sqlx::query_as::<_, crate::db::models::Token>(
        "SELECT * FROM tokens WHERE key_value = ? AND enabled = 1",
    )
    .bind(&token_value)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid API key".into()))?;

    // Check token expiry
    if let Some(expires) = &token.expires_at {
        let now = chrono::Utc::now().naive_utc().to_string();
        if *expires < now {
            return Err(AppError::Unauthorized("API key expired".into()));
        }
    }

    // 2. Decode request
    let decoder = chat::get_decoder(input_format);
    let ir = decoder.decode_request(&body)?;

    // 3. Determine output format
    let output_format_str = middleware::extract_output_format(&headers, None);
    let output_format = output_format_str
        .as_ref()
        .and_then(|s| ChatFormat::from_str_loose(s))
        .unwrap_or(input_format);

    // 4. Select channel via routing (priority + weighted random + circuit breaker)
    let selected =
        balancer::select_channel(&ir.model, &state.db, &state.circuit).await?;

    let channel = &selected.channel;
    let mapping = &selected.mapping;
    let api_key = &selected.api_key;

    // Save context for logging
    let token_id = token.id.clone();
    let channel_id = channel.id.clone();
    let model = ir.model.clone();
    let input_fmt_str = input_format.as_str().to_string();
    let request_body_str = String::from_utf8_lossy(&body).to_string();

    // 5. Determine upstream format from channel provider
    let upstream_format = ChatFormat::from_provider(&channel.provider)
        .ok_or_else(|| AppError::Internal(format!("Unknown provider: {}", channel.provider)))?;
    let output_fmt_str = upstream_format.as_str().to_string();

    // 6. Encode IR → upstream format
    let upstream_encoder = chat::get_encoder(upstream_format);
    let upstream_body = upstream_encoder.encode_request(&ir, &mapping.actual_name)?;

    // 7. Build upstream URL
    let upstream_url =
        build_upstream_url(&channel.base_url, upstream_format, &mapping.actual_name, ir.stream);

    // 8. Build upstream request with provider-specific auth
    let mut req_builder = state
        .http_client
        .post(&upstream_url)
        .header("Content-Type", "application/json")
        .body(upstream_body);

    req_builder = apply_auth(req_builder, upstream_format, api_key);

    // 9. Send request
    let upstream_resp = req_builder.send().await;

    let upstream_resp = match upstream_resp {
        Ok(r) => r,
        Err(e) => {
            state.circuit.record_failure(&channel.id);
            let latency = start.elapsed().as_millis() as i64;
            log_request(
                &state.db, &token_id, &channel_id, &model, "chat",
                &input_fmt_str, &output_fmt_str, None,
                latency, None, None, Some(&request_body_str), Some(&e.to_string()),
            ).await;
            return Err(AppError::HttpClient(e));
        }
    };

    let status = upstream_resp.status();

    if !status.is_success() {
        state.circuit.record_failure(&channel.id);
        let error_body = upstream_resp.text().await.unwrap_or_default();
        let latency = start.elapsed().as_millis() as i64;
        log_request(
            &state.db, &token_id, &channel_id, &model, "chat",
            &input_fmt_str, &output_fmt_str, Some(status.as_u16() as i32),
            latency, None, None, Some(&request_body_str), Some(&error_body),
        ).await;
        return Err(AppError::Upstream {
            status: status.as_u16(),
            body: error_body,
        });
    }

    // Success — record it
    state.circuit.record_success(&channel.id);

    // 10. Handle streaming vs non-streaming
    if ir.stream {
        // Log streaming request (response body will be updated after stream ends)
        let latency = start.elapsed().as_millis() as i64;
        let log_id = log_request(
            &state.db, &token_id, &channel_id, &model, "chat",
            &input_fmt_str, &output_fmt_str, Some(200),
            latency, None, None, Some(&request_body_str), None,
        ).await;
        return proxy_stream(upstream_resp, upstream_format, output_format, state.db.clone(), log_id).await;
    }

    // Non-streaming: decode upstream response → IR → encode to output format
    let resp_bytes = upstream_resp.bytes().await?;
    let upstream_decoder = chat::get_decoder(upstream_format);
    let ir_response = upstream_decoder.decode_response(&resp_bytes)?;

    let output_encoder = chat::get_encoder(output_format);
    let output_bytes = output_encoder.encode_response(&ir_response)?;

    // Log the request with token usage
    let latency = start.elapsed().as_millis() as i64;
    let prompt_tokens = ir_response.usage.as_ref().map(|u| u.prompt_tokens as i64);
    let completion_tokens = ir_response.usage.as_ref().map(|u| u.completion_tokens as i64);
    let resp_body_str = String::from_utf8_lossy(&output_bytes).to_string();
    log_request(
        &state.db, &token_id, &channel_id, &model, "chat",
        &input_fmt_str, &output_fmt_str, Some(200),
        latency, prompt_tokens, completion_tokens,
        Some(&request_body_str), Some(&resp_body_str),
    ).await;

    // Update token quota usage
    if let Some(pt) = prompt_tokens {
        if let Some(ct) = completion_tokens {
            let total = pt + ct;
            let _ = sqlx::query("UPDATE tokens SET quota_used = quota_used + ? WHERE id = ?")
                .bind(total)
                .bind(&token_id)
                .execute(&state.db)
                .await;
        }
    }

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Body::from(output_bytes))
        .unwrap())
}

/// Handle streaming proxy: pipe upstream SSE → decode → re-encode → downstream SSE.
/// Accumulates the output chunks and updates the log entry's response_body when the stream ends.
async fn proxy_stream(
    upstream_resp: reqwest::Response,
    upstream_format: ChatFormat,
    output_format: ChatFormat,
    db: SqlitePool,
    log_id: String,
) -> Result<Response, AppError> {
    let upstream_decoder = chat::get_decoder(upstream_format);
    let output_encoder = chat::get_encoder(output_format);

    let byte_stream = upstream_resp.bytes_stream();

    let sse_stream = async_stream::stream! {
        let mut buffer = String::new();
        let mut byte_stream = Box::pin(byte_stream);
        let mut response_chunks: Vec<String> = Vec::new();

        while let Some(chunk_result) = byte_stream.next().await {
            let chunk = match chunk_result {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Upstream stream error: {}", e);
                    break;
                }
            };

            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete SSE lines
            while let Some(pos) = buffer.find("\n\n") {
                let event_block = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                for line in event_block.lines() {
                    let data = if let Some(d) = line.strip_prefix("data: ") {
                        d.trim()
                    } else if let Some(d) = line.strip_prefix("data:") {
                        d.trim()
                    } else {
                        continue;
                    };

                    if upstream_decoder.is_stream_done(data) {
                        // Send output format's done signal
                        if let Some(done) = output_encoder.stream_done_signal() {
                            yield Ok::<_, std::convert::Infallible>(
                                format!("data: {}\n\n", done)
                            );
                        }
                        break;
                    }

                    match upstream_decoder.decode_stream_chunk(data) {
                        Ok(Some(ir_chunk)) => {
                            match output_encoder.encode_stream_chunk(&ir_chunk) {
                                Ok(Some(encoded)) => {
                                    response_chunks.push(encoded.clone());
                                    yield Ok(format!("data: {}\n\n", encoded));
                                }
                                Ok(None) => {}
                                Err(e) => {
                                    log::error!("Encode stream chunk error: {}", e);
                                }
                            }
                        }
                        Ok(None) => {}
                        Err(e) => {
                            log::error!("Decode stream chunk error: {}", e);
                        }
                    }
                }
            }
        }

        // Stream finished — update the log with accumulated response body
        if !response_chunks.is_empty() {
            let response_body = format!("[{}]", response_chunks.join(","));
            let _ = sqlx::query("UPDATE request_logs SET response_body = ? WHERE id = ?")
                .bind(&response_body)
                .bind(&log_id)
                .execute(&db)
                .await;
        }
    };

    let body = Body::from_stream(sse_stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(body)
        .unwrap())
}

/// Log a request to the request_logs table (fire-and-forget, errors are only logged).
/// Returns the generated log ID.
#[allow(clippy::too_many_arguments)]
async fn log_request(
    db: &SqlitePool,
    token_id: &str,
    channel_id: &str,
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
) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query(
        "INSERT INTO request_logs (id, token_id, channel_id, model, modality, input_format, output_format, status, latency_ms, prompt_tokens, completion_tokens, request_body, response_body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(token_id)
    .bind(channel_id)
    .bind(model)
    .bind(modality)
    .bind(input_format)
    .bind(output_format)
    .bind(status)
    .bind(latency_ms)
    .bind(prompt_tokens)
    .bind(completion_tokens)
    .bind(request_body)
    .bind(response_body)
    .bind(&now)
    .execute(db)
    .await;

    if let Err(e) = result {
        log::error!("Failed to log request: {}", e);
    }
    id
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
