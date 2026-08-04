//! substrato-7001/src/metrics_exporter.rs
//! Exporta métricas do Substrato 7001 para Prometheus
//!
//! Selo: CATHEDRAL-ARKHE-POLAR-METRICS-v2.0.0-2026-06-19

use axum::{routing::get, Router};
use metrics_exporter_prometheus::PrometheusBuilder;

pub fn install_metrics_exporter(port: u16) -> anyhow::Result<()> {
    let builder = PrometheusBuilder::new()
        .with_http_listener(format!("0.0.0.0:{}", port).parse::<std::net::SocketAddr>()?);

    builder.install()?;

    // Registra métricas estáticas do serviço
    metrics::gauge!("cathedral_substrate", "id" => "7001", "type" => "x402-polar").set(1.0);
    metrics::gauge!("cathedral_build_info", "version" => "2.0.0", "selo" => "CATHEDRAL-ARKHE-POLAR-v2.0.0").set(1.0);

    tracing::info!("📊 Prometheus metrics exportado em :{}/metrics", port);
    Ok(())
}

pub fn metrics_router() -> Router {
    Router::new().route("/metrics", get(|| async {
        // O metrics-exporter-prometheus já expõe em /metrics automaticamente
        "Use o endpoint do PrometheusBuilder".to_string()
    }))
}
