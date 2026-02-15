use super::generic_proxy::{self, GenericProxyState};
use super::proxy::{self, ProxyState};
use crate::error::AppError;
use crate::rules::registry::RuleRegistry;
use crate::routing::circuit::CircuitBreaker;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::{Json, Response};
use axum::routing::{get, post};
use axum::Router;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

pub async fn create_router(pool: SqlitePool) -> Router {
    let http_client = reqwest::Client::new();
    let circuit = Arc::new(CircuitBreaker::new(5, 60));
    let registry = Arc::new(RuleRegistry::new());
    registry.load_from_db(&pool).await;

    let generic_state = GenericProxyState {
        db: pool.clone(),
        http_client: http_client.clone(),
    };

    let proxy_state = ProxyState {
        db: pool,
        http_client,
        circuit,
        registry,
    };

    Router::new()
        .route("/health", get(health_check))
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
        .fallback(
            axum::routing::any(generic_proxy::handle_generic_proxy)
                .with_state(generic_state),
        )
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn list_models(
    State(state): State<ProxyState>,
) -> Result<Json<Value>, AppError> {
    let models: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT public_name FROM model_mappings",
    )
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
