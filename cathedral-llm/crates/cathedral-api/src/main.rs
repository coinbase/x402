use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use cathedral_inference_runtime::{CathedralRuntime, GenerateRequest, VerificationLevel};

#[derive(Deserialize)]
pub struct ApiRequest {
    pub prompt: String,
    pub did: String,
    pub signature: String,
    pub level: String,
}

#[derive(Serialize)]
pub struct ApiResponse {
    pub text: String,
    pub thinking: Option<String>,
    pub zk_proof: Option<String>,
    pub signature: String,
    pub receipt: String,
    pub latency_ms: u64,
    pub reputation: f64,
    pub tier: String,
}

#[derive(Deserialize)]
pub struct MemoryQuery {
    limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: String,
    limit: Option<usize>,
}

async fn generate_handler(
    State(runtime): State<Arc<CathedralRuntime>>,
    Json(req): Json<ApiRequest>,
) -> Json<ApiResponse> {
    let level = VerificationLevel::from_str(&req.level);
    let sig = hex::decode(req.signature).unwrap_or_default();
    let gen_req = GenerateRequest {
        prompt: req.prompt,
        did: req.did,
        signature: sig,
        level,
        context: None,
    };
    let resp = runtime.generate(gen_req).await.unwrap();
    Json(ApiResponse {
        text: resp.text,
        thinking: resp.thinking,
        zk_proof: resp.zk_proof.map(|p| p.hash),
        signature: hex::encode(resp.signature),
        receipt: resp.receipt.id,
        latency_ms: resp.latency_ms,
        reputation: resp.reputation,
        tier: resp.tier,
    })
}

async fn memory_handler(
    State(runtime): State<Arc<CathedralRuntime>>,
    Path(did): Path<String>,
    query: Query<MemoryQuery>,
) -> Json<serde_json::Value> {
    let limit = query.limit.unwrap_or(10);
    let memories = runtime.wormgraph.get_memories(&did, limit).await.unwrap_or_default();
    Json(serde_json::to_value(&memories).unwrap())
}

async fn search_handler(
    State(runtime): State<Arc<CathedralRuntime>>,
    Path(did): Path<String>,
    Query(params): Query<SearchQuery>,
) -> Json<serde_json::Value> {
    let limit = params.limit.unwrap_or(5);
    let results = runtime.wormgraph
        .search_similar(&did, &params.q, limit)
        .await
        .unwrap_or_default();
    Json(serde_json::to_value(&results).unwrap())
}

async fn status_handler(
    State(runtime): State<Arc<CathedralRuntime>>,
    Path(did): Path<String>,
) -> Json<serde_json::Value> {
    let score = runtime.reputation.score(&did).await.unwrap_or(0.0);
    let classification = runtime.reputation.classify(score);
    let thresholds = runtime.reputation.thresholds();
    let status = serde_json::json!({
        "did": did,
        "reputation": score,
        "classification": classification,
        "thresholds": {
            "excellent": thresholds.excellent,
            "good": thresholds.good,
            "regular": thresholds.regular,
            "low": thresholds.low,
        },
        "memory_count": runtime.wormgraph.get_memories(&did, 1000).await.unwrap_or_default().len(),
    });
    Json(status)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let runtime = Arc::new(CathedralRuntime::new().await);
    let app = Router::new()
        .route("/generate", post(generate_handler))
        .route("/memory/:did", get(memory_handler))
        .route("/memory/:did/search", get(search_handler))
        .route("/status/:did", get(status_handler))
        .with_state(runtime);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    tracing::info!("Cathedral-LLM API listening on http://0.0.0.0:8080");
    axum::serve(listener, app).await.unwrap();
}
