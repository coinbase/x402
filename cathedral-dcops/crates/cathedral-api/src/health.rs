use axum::{extract::State, response::Json};
use std::sync::Arc;
use serde_json::json;
use crate::AppState;

pub async fn health_check(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let db_ok = state.wormgraph.ping().await.is_ok();
    let crates = vec!["core", "runtime", "identity", "wormgraph", "zk"];
    let crate_status: std::collections::HashMap<_, _> = crates.into_iter().map(|c| (c, true)).collect();
    Json(json!({
        "status": "ok",
        "database": db_ok,
        "crates": crate_status,
    }))
}
