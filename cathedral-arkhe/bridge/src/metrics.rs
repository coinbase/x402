use prometheus::{register_counter, register_histogram, Counter, Histogram, Encoder, TextEncoder};
use lazy_static::lazy_static;
use axum::{Router, routing::get, response::IntoResponse};

lazy_static! {
    pub static ref EVENTS_ACCEPTED: Counter = register_counter!(
        "cathedral_events_accepted_total",
        "Total de eventos aceitos pela Bridge"
    ).unwrap();
    pub static ref EVENTS_REJECTED: Counter = register_counter!(
        "cathedral_events_rejected_total",
        "Total de eventos rejeitados"
    ).unwrap();
    pub static ref INGEST_LATENCY: Histogram = register_histogram!(
        "cathedral_ingest_duration_seconds",
        "Tempo de processamento do ingest"
    ).unwrap();
}

pub async fn metrics_handler() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).unwrap();
    String::from_utf8(buffer).unwrap()
}

pub fn metrics_router() -> Router {
    Router::new().route("/metrics", get(metrics_handler))
}
