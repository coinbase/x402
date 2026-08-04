use axum::{Router, routing::get, Json};
use serde_json::json;

pub async fn health_check() -> Json<serde_json::Value> {
    Json(json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

pub fn health_router() -> Router {
    Router::new().route("/health", get(health_check))
}
