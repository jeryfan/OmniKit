use super::generic_proxy::{self, GenericProxyState};
use super::proxy::{self, ProxyState};
use crate::error::AppError;
use crate::routing::circuit::CircuitBreaker;
use axum::body::{Body, Bytes};
use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::{Json, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

pub async fn create_router(pool: SqlitePool) -> Router {
    let http_client = reqwest::Client::new();
    let circuit = Arc::new(CircuitBreaker::new(5, 60));

    let generic_state = GenericProxyState {
        db: pool.clone(),
        http_client: http_client.clone(),
    };

    let proxy_state = ProxyState {
        db: pool,
        http_client,
        circuit,
    };

    Router::new()
        .route("/health", get(health_check))
        // Video proxy for preview player
        .route("/video-proxy", get(handle_video_proxy))
        // Model list
        .route("/v1/models", get(list_models))
        // OpenAI Chat Completions compatible endpoint
        .route("/v1/chat/completions", post(handle_openai_chat))
        // OpenAI Responses compatible endpoint
        .route("/v1/responses", post(handle_openai_responses))
        // Anthropic Messages compatible endpoint
        .route("/v1/messages", post(handle_anthropic))
        .layer(CorsLayer::permissive())
        .with_state(proxy_state)
        .fallback(axum::routing::any(generic_proxy::handle_generic_proxy).with_state(generic_state))
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn list_models(State(state): State<ProxyState>) -> Result<Json<Value>, AppError> {
    let models: Vec<String> = sqlx::query_scalar("SELECT DISTINCT public_name FROM model_mappings")
        .fetch_all(&state.db)
        .await?;

    let model_list: Vec<Value> = models
        .iter()
        .map(|m| {
            json!({
                "id": m,
                "object": "model",
                "owned_by": "omnikit",
            })
        })
        .collect();

    Ok(Json(json!({
        "object": "list",
        "data": model_list,
    })))
}

async fn handle_openai_chat(
    state: State<ProxyState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    proxy::proxy_chat(state, headers, "openai-chat", body).await
}

async fn handle_openai_responses(
    state: State<ProxyState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    proxy::proxy_chat(state, headers, "openai-responses", body).await
}

async fn handle_anthropic(
    state: State<ProxyState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    proxy::proxy_chat(state, headers, "anthropic", body).await
}

#[derive(Deserialize)]
struct VideoProxyQuery {
    url: String,
}

async fn handle_video_proxy(
    State(state): State<ProxyState>,
    headers: HeaderMap,
    Query(query): Query<VideoProxyQuery>,
) -> Result<Response<Body>, AppError> {
    let video_url = &query.url;

    // Resolve the actual CDN URL (handle Douyin 302 redirects)
    let resolved_url = if video_url.contains("aweme.snssdk.com")
        || video_url.contains("api-h2.amemv.com")
    {
        // Build a no-redirect client only when needed (Douyin short URLs)
        let no_redirect_client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {}", e)))?;
        let resp = no_redirect_client
            .get(video_url)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to resolve redirect: {}", e)))?;
        if resp.status().is_redirection() {
            resp.headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(video_url)
                .to_string()
        } else {
            video_url.clone()
        }
    } else {
        video_url.clone()
    };

    // Build the upstream request with platform-specific headers
    // Add browser User-Agent (required by Bilibili CDN etc.) per-request to reuse shared client's connection pool
    let mut req = state.http_client.get(&resolved_url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

    if video_url.contains("bilibili.com") || video_url.contains("bilivideo") {
        req = req.header("Referer", "https://www.bilibili.com/");
    }

    // Pass through Range header for seeking support
    if let Some(range) = headers.get("range") {
        req = req.header("Range", range.clone());
    }

    let upstream = req
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to fetch video: {}", e)))?;

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();

    // Build response with relevant headers
    let mut response =
        Response::builder().status(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK));

    let passthrough_headers = [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
    ];
    for name in passthrough_headers {
        if let Some(val) = upstream_headers.get(name) {
            response = response.header(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_bytes(val.as_bytes()).unwrap(),
            );
        }
    }

    // Allow cross-origin access from the webview
    response = response.header("Access-Control-Allow-Origin", "*");

    // Stream the body
    let stream = upstream.bytes_stream();
    let body = Body::from_stream(stream);

    response
        .body(body)
        .map_err(|e| AppError::Internal(format!("Failed to build response: {}", e)))
}
