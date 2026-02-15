pub mod generic_proxy;
pub mod middleware;
pub mod proxy;
pub mod router;

use sqlx::SqlitePool;
use std::net::SocketAddr;

pub async fn start(
    pool: SqlitePool,
    port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let app = router::create_router(pool).await;
    let addr = SocketAddr::from(([127, 0, 0, 1], port));

    let listener = tokio::net::TcpListener::bind(addr).await?;
    log::info!("Axum server listening on {}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
