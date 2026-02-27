use super::proxy::{self, ProxyState};
use crate::routing::circuit::CircuitBreaker;
use crate::routing::KeyRotationState;
use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::{Json, Response};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

pub async fn create_router(pool: SqlitePool) -> Router {
    let http_client = reqwest::Client::new();
    let circuit = Arc::new(CircuitBreaker::new(5, 60));
    let rotation = Arc::new(KeyRotationState::new());

    let proxy_state = ProxyState {
        db: pool,
        http_client,
        circuit,
        rotation,
    };

    Router::new()
        .route("/health", get(health_check))
        .route("/video-proxy", get(handle_video_proxy))
        .fallback(axum::routing::any(proxy::handle_route_proxy).with_state(proxy_state.clone()))
        .layer(CorsLayer::permissive())
        .with_state(proxy_state)
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

#[derive(Deserialize)]
struct VideoProxyQuery {
    url: String,
}

async fn handle_video_proxy(
    State(state): State<ProxyState>,
    headers: HeaderMap,
    Query(query): Query<VideoProxyQuery>,
) -> Result<Response<Body>, crate::error::AppError> {
    let video_url = &query.url;

    let resolved_url = if video_url.contains("aweme.snssdk.com")
        || video_url.contains("api-h2.amemv.com")
    {
        let no_redirect_client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| crate::error::AppError::Internal(format!("Failed to build HTTP client: {}", e)))?;
        let resp = no_redirect_client
            .get(video_url)
            .send()
            .await
            .map_err(|e| crate::error::AppError::Internal(format!("Failed to resolve redirect: {}", e)))?;
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

    let mut req = state.http_client.get(&resolved_url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

    if video_url.contains("bilibili.com") || video_url.contains("bilivideo") {
        req = req.header("Referer", "https://www.bilibili.com/");
    }

    if let Some(range) = headers.get("range") {
        req = req.header("Range", range.clone());
    }

    let upstream = req
        .send()
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("Failed to fetch video: {}", e)))?;

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();

    let mut response = Response::builder()
        .status(StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK));

    let passthrough_headers = ["content-type", "content-length", "content-range", "accept-ranges"];
    for name in passthrough_headers {
        if let Some(val) = upstream_headers.get(name) {
            response = response.header(
                HeaderName::from_bytes(name.as_bytes()).unwrap(),
                HeaderValue::from_bytes(val.as_bytes()).unwrap(),
            );
        }
    }

    response = response.header("Access-Control-Allow-Origin", "*");

    let stream = upstream.bytes_stream();
    let body = Body::from_stream(stream);

    response
        .body(body)
        .map_err(|e| crate::error::AppError::Internal(format!("Failed to build response: {}", e)))
}
