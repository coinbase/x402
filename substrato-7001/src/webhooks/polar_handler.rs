use std::sync::Arc;
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::post,
};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::RwLock;
use tracing::{info, warn, error};
use tokio_retry::{
    strategy::{jitter, ExponentialBackoff},
    Retry,
};

type HmacSha256 = Hmac<Sha256>;

// ============================================================================
// 1. DEAD LETTER QUEUE
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeadLetterEvent {
    pub event_type: String,
    pub data: Value,
    pub error: String,
    pub attempt: u32,
    pub timestamp: String,
}

pub type DeadLetterQueue = Arc<RwLock<Vec<DeadLetterEvent>>>;

// ============================================================================
// 2. CONFIGURAÇÃO
// ============================================================================

#[derive(Debug, Clone)]
pub struct WebhookConfig {
    pub secret: String,
    pub wormgraph_url: String,
    pub max_retries: u32,
}

impl WebhookConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            secret: std::env::var("POLAR_WEBHOOK_SECRET")
                .map_err(|_| anyhow::anyhow!("POLAR_WEBHOOK_SECRET não definido"))?,
            wormgraph_url: std::env::var("WORMGRAPH_URL")
                .unwrap_or_else(|_| "http://localhost:8787".to_string()),
            max_retries: std::env::var("POLAR_WEBHOOK_MAX_RETRIES")
                .unwrap_or_else(|_| "3".to_string())
                .parse()
                .unwrap_or(3),
        })
    }
}

// ============================================================================
// 3. WEBHOOK HANDLER
// ============================================================================

pub struct PolarWebhookHandler {
    config: WebhookConfig,
    http: reqwest::Client,
    dlq: DeadLetterQueue,
    oss_engine: OssDistributionEngine,
}

impl PolarWebhookHandler {
    pub fn new(config: WebhookConfig, dlq: DeadLetterQueue) -> Self {
        Self {
            http: reqwest::Client::new(),
            oss_engine: OssDistributionEngine::from_env(),
            dlq,
            config,
        }
    }

    /// Verifica assinatura HMAC-SHA256
    /// O Polar envia o header "Polar-Signature" (não "x-polar-signature")
    pub fn verify_signature(&self, payload: &[u8], header: Option<&str>) -> bool {
        let sig = match header {
            Some(s) => s.trim(),
            None => {
                warn!("Header Polar-Signature ausente");
                return false;
            }
        };

        let mut mac = match HmacSha256::new_from_slice(self.config.secret.as_bytes()) {
            Ok(m) => m,
            Err(e) => {
                error!("Secret inválido: {}", e);
                return false;
            }
        };

        mac.update(payload);
        let computed = hex::encode(mac.finalize().into_bytes());

        // Polar usa formato: t=timestamp,v1=hex_digest
        let expected = match sig.split(',').find(|part| part.starts_with("v1=")) {
            Some(part) => &part[3..],
            None => sig, // fallback: compara direto
        };

        if computed == expected {
            true
        } else {
            warn!("Assinatura inválida: computed={}, received={}", computed, expected);
            false
        }
    }

    /// Processa evento com retry
    pub async fn process_with_retry(&self, event_type: String, data: Value) {
        let action = || async {
            self.handle_event(&event_type, &data).await
        };

        let retry_strategy = ExponentialBackoff::from_millis(100)
            .max_delay(std::time::Duration::from_secs(10))
            .map(jitter)
            .take(self.config.max_retries as usize);

        match Retry::spawn(retry_strategy, action).await {
            Ok(_) => info!("✅ Evento processado: {}", event_type),
            Err(e) => {
                error!("❌ Evento falhou após {} tentativas: {} — {}",
                    self.config.max_retries, event_type, e);

                // Envia para DLQ
                let mut dlq = self.dlq.write().await;
                dlq.push(DeadLetterEvent {
                    event_type: event_type.to_string(),
                    data: data.clone(),
                    error: e.to_string(),
                    attempt: self.config.max_retries,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                });
            }
        }
    }

    async fn handle_event(&self, event_type: &str, data: &Value) -> anyhow::Result<()> {
        info!("📦 Polar webhook: {}", event_type);

        match event_type {
            "order.paid" => self.handle_order_paid(data).await?,
            "order.created" => self.handle_order_created(data).await?,
            "subscription.created" => self.handle_subscription_created(data).await?,
            "subscription.updated" => self.handle_subscription_updated(data).await?,
            "subscription.canceled" => self.handle_subscription_canceled(data).await?,
            "product.created" => self.handle_product_created(data).await?,
            _ => info!("Ignorando evento: {}", event_type),
        }

        // Sempre registra no WormGraph (auditoria)
        self.log_to_wormgraph(event_type, data).await?;

        Ok(())
    }

    // ================================================================
    // EVENT HANDLERS
    // ================================================================

    async fn handle_order_paid(&self, data: &Value) -> anyhow::Result<()> {
        let order_id = data["id"].as_str().unwrap_or("unknown");
        let amount = data["amount"].as_i64().unwrap_or(0);
        let customer_email = data["customer"]["email"].as_str().unwrap_or("unknown");
        let product_id = data["product_id"].as_str()
            .or_else(|| data["product"]["id"].as_str())
            .unwrap_or("unknown");

        info!("💰 Order paid: {} ({}¢) by {} for {}", order_id, amount, customer_email, product_id);

        // 1% OSS distribution (conectado!)
        if amount > 0 {
            if let Err(e) = self.oss_engine.process_order(data).await {
                warn!("OSS distribution falhou para order {}: {}", order_id, e);
                // Não falha o webhook inteiro por causa do OSS
            }
        }

        // Libera acesso ao serviço
        self.grant_access(product_id, customer_email).await?;

        // Exporta métrica
        metrics::counter!("polar_orders_paid_total").increment(1);
        metrics::counter!("polar_revenue_cents_total").increment(amount as u64);

        Ok(())
    }

    async fn handle_order_created(&self, data: &Value) -> anyhow::Result<()> {
        let order_id = data["id"].as_str().unwrap_or("unknown");
        info!("📝 Order created: {}", order_id);
        metrics::counter!("polar_orders_created_total").increment(1);
        Ok(())
    }

    async fn handle_subscription_created(&self, data: &Value) -> anyhow::Result<()> {
        let sub_id = data["id"].as_str().unwrap_or("unknown");
        let email = data["customer"]["email"].as_str().unwrap_or("unknown");
        let product_id = data["product_id"].as_str()
            .or_else(|| data["product"]["id"].as_str())
            .unwrap_or("unknown");

        info!("✅ Subscription created: {} for {}", sub_id, email);
        self.grant_access(product_id, email).await?;
        metrics::counter!("polar_subscriptions_created_total").increment(1);
        Ok(())
    }

    async fn handle_subscription_updated(&self, data: &Value) -> anyhow::Result<()> {
        let sub_id = data["id"].as_str().unwrap_or("unknown");
        let status = data["status"].as_str().unwrap_or("unknown");
        info!("🔄 Subscription updated: {} → {}", sub_id, status);

        if status == "past_due" || status == "canceled" || status == "unpaid" {
            self.revoke_access(sub_id).await?;
            metrics::counter!("polar_subscriptions_revoked_total").increment(1);
        }

        metrics::gauge!("polar_active_subscriptions").set(
            match status { "active" => 1.0, _ => 0.0 });
        Ok(())
    }

    async fn handle_subscription_canceled(&self, data: &Value) -> anyhow::Result<()> {
        let sub_id = data["id"].as_str().unwrap_or("unknown");
        info!("❌ Subscription canceled: {}", sub_id);
        self.revoke_access(sub_id).await?;
        metrics::counter!("polar_subscriptions_canceled_total").increment(1);
        Ok(())
    }

    async fn handle_product_created(&self, data: &Value) -> anyhow::Result<()> {
        let name = data["name"].as_str().unwrap_or("unknown");
        let id = data["id"].as_str().unwrap_or("unknown");
        info!("📦 Product created: {} ({})", name, id);
        Ok(())
    }

    // ================================================================
    // AÇÕES
    // ================================================================

    async fn grant_access(&self, product_id: &str, customer_email: &str) -> anyhow::Result<()> {
        info!("🔓 Granting access: {} → {}", customer_email, product_id);
        // Em produção: Redis SET, DB UPDATE, ou chamar APIs externas
        // Ex: self.redis.set(format!("access:{}:{}", customer_email, product_id), "1", 30*86400).await?;
        Ok(())
    }

    async fn revoke_access(&self, sub_id: &str) -> anyhow::Result<()> {
        info!("🔒 Revoking access for subscription: {}", sub_id);
        // Em produção: Redis DEL, DB UPDATE
        Ok(())
    }

    async fn log_to_wormgraph(&self, event_type: &str, data: &Value) -> anyhow::Result<()> {
        let payload = json!({
            "record_type": "polar_webhook",
            "event": event_type,
            "data": data,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "selo": "CATHEDRAL-ARKHE-POLAR-WEBHOOK-v2.0.0"
        });

        let url = format!("{}/api/events", self.config.wormgraph_url);

        // Fire-and-forget com timeout curto (não bloqueia o webhook)
        let _ = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            self.http.post(&url).json(&payload).send(),
        ).await;

        Ok(())
    }
}

// ============================================================================
// 4. OSS DISTRIBUTION ENGINE (integrado ao webhook)
// ============================================================================

pub struct OssDistributionEngine {
    enabled: bool,
    percentage: f64,
    min_payout_cents: i64,
    contributors: Vec<OssContributor>,
    wormgraph_url: String,
    http: reqwest::Client,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OssContributor {
    pub github_handle: String,
    pub share: f64,
}

impl OssDistributionEngine {
    pub fn from_env() -> Self {
        let contributors_str = std::env::var("POLAR_OSS_CONTRIBUTORS")
            .unwrap_or_else(|_| "[]".to_string());

        let contributors: Vec<OssContributor> =
            serde_json::from_str(&contributors_str).unwrap_or_default();

        Self {
            enabled: std::env::var("POLAR_OSS_ENABLED")
                .unwrap_or_else(|_| "true".to_string()) == "true",
            percentage: std::env::var("POLAR_OSS_PERCENTAGE")
                .unwrap_or_else(|_| "0.01".to_string())
                .parse()
                .unwrap_or(0.01),
            min_payout_cents: std::env::var("POLAR_OSS_MIN_PAYOUT")
                .unwrap_or_else(|_| "100".to_string())
                .parse()
                .unwrap_or(100),
            wormgraph_url: std::env::var("WORMGRAPH_URL")
                .unwrap_or_else(|_| "http://localhost:8787".to_string()),
            contributors,
            http: reqwest::Client::new(),
        }
    }

    pub async fn process_order(&self, order_data: &Value) -> anyhow::Result<Value> {
        if !self.enabled || self.contributors.is_empty() {
            return Ok(json!({"status": "skipped", "reason": "disabled or no contributors"}));
        }

        let amount = order_data["amount"].as_i64().unwrap_or(0);
        let order_id = order_data["id"].as_str().unwrap_or("unknown");
        let oss_total = (amount as f64 * self.percentage).round() as i64;

        if oss_total < self.min_payout_cents {
            return Ok(json!({
                "status": "below_minimum",
                "oss_amount_cents": oss_total,
                "min_payout_cents": self.min_payout_cents
            }));
        }

        let total_share: f64 = self.contributors.iter().map(|c| c.share).sum();
        if total_share <= 0.0 {
            return Ok(json!({"status": "skipped", "reason": "total_share <= 0"}));
        }

        let mut distributions = Vec::new();
        for c in &self.contributors {
            let amt = ((oss_total as f64) * (c.share / total_share)).round() as i64;
            if amt > 0 {
                distributions.push(json!({
                    "github_handle": c.github_handle,
                    "amount_cents": amt,
                    "amount_usd": format!("{:.2}", amt as f64 / 100.0),
                }));
            }
        }

        // Registra no WormGraph
        let payload = json!({
            "record_type": "oss_distribution",
            "order_id": order_id,
            "total_oss_cents": oss_total,
            "distributions": distributions,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "selo": "CATHEDRAL-ARKHE-OSS-DIST-v2.0.0"
        });

        let _ = self.http
            .post(format!("{}/api/events", self.wormgraph_url))
            .json(&payload)
            .send()
            .await?;

        metrics::counter!("polar_oss_distributed_cents_total").increment(oss_total as u64);

        Ok(json!({
            "status": "distributed",
            "order_id": order_id,
            "oss_total_cents": oss_total,
            "recipients": distributions.len(),
            "distributions": distributions
        }))
    }
}

// ============================================================================
// 5. ROTAS AXUM
// ============================================================================

pub async fn webhook_handler(
    State(handler): State<crate::AppState>,
    headers: axum::http::HeaderMap,
    body: String,
) -> impl IntoResponse {
    // Verifica assinatura — Polar usa "Polar-Signature" (corrigido do v1)
    let signature = headers
        .get("polar-signature")
        .and_then(|v| v.to_str().ok());

    if !handler.handler.verify_signature(body.as_bytes(), signature) {
        warn!("Webhook rejeitado: assinatura inválida");
        return (StatusCode::UNAUTHORIZED, "Invalid signature").into_response();
    }

    // Parseia payload
    let payload: Value = match serde_json::from_str(&body) {
        Ok(p) => p,
        Err(e) => {
            error!("JSON inválido: {}", e);
            return (StatusCode::BAD_REQUEST, "Invalid JSON").into_response();
        }
    };

    // Polar envia: { "type": "order.paid", "data": { ... } }
    // (não "event", mas "type" — corrigido do v1)
    let event_type = payload["type"].as_str().unwrap_or("unknown").to_string();
    let data = payload["data"].clone();

    // Processa de forma assíncrona (não bloqueia a resposta)
    let handler_clone = Arc::clone(&handler.handler);
    tokio::spawn(async move {
        handler_clone.process_with_retry(event_type, data).await;
    });

    // Responde 200 imediatamente (Polar recomenda resposta rápida)
    (StatusCode::OK, "OK").into_response()
}

/// Endpoint para inspect da DLQ
pub async fn dlq_handler(
    State(state): State<crate::AppState>,
) -> impl IntoResponse {
    let queue = state.dlq.read().await;
    axum::Json(json!({
        "count": queue.len(),
        "events": queue.as_slice(),
    }))
}

/// Endpoint de saúde
pub async fn health_handler() -> impl IntoResponse {
    axum::Json(json!({
        "status": "healthy",
        "service": "cathedral-x402-polar-webhooks",
        "version": "2.0.0",
        "selo": "CATHEDRAL-ARKHE-POLAR-WH-v2.0.0"
    }))
}
