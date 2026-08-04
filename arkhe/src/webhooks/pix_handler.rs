use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Router,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, error, warn};
use chrono::{Utc, DateTime};

use crate::integrations::pix::{PixWebhookPayload, PixStatus};
use crate::swarm::orchestrator::SecondSelfOrchestrator;
use crate::evolution::desci_node_resource::RoyaltyConfig;

#[derive(Debug, Deserialize)]
pub struct PixWebhookRequest {
    pub transaction_id: String,
    pub status: String,
    pub paid_amount: Option<f64>,
    pub paid_at: Option<DateTime<Utc>>,
    pub payer_document: Option<String>,
    pub payer_name: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct PixWebhookResponse {
    pub status: String,
    pub message: String,
}

pub struct PixWebhookHandler {
    orchestrator: Arc<tokio::sync::Mutex<SecondSelfOrchestrator>>,
    pix_gateway: crate::integrations::pix::PixGateway,
}

impl PixWebhookHandler {
    pub fn new(
        orchestrator: Arc<tokio::sync::Mutex<SecondSelfOrchestrator>>,
        pix_gateway: crate::integrations::pix::PixGateway,
    ) -> Self {
        Self { orchestrator, pix_gateway }
    }

    pub async fn handle_webhook(
        State(state): State<Arc<PixWebhookHandler>>,
        Json(payload): Json<PixWebhookRequest>,
    ) -> impl IntoResponse {
        info!("📨 Webhook Pix recebido: tx={}, status={}", payload.transaction_id, payload.status);

        if !state.verify_signature(&payload).await {
            warn!("⚠️ Assinatura inválida no webhook");
            return (
                StatusCode::UNAUTHORIZED,
                Json(PixWebhookResponse {
                    status: "error".to_string(),
                    message: "Assinatura inválida".to_string(),
                }),
            );
        }

        let status = match payload.status.as_str() {
            "PAID" => PixStatus::Paid,
            "EXPIRED" => PixStatus::Expired,
            "CANCELLED" => PixStatus::Cancelled,
            _ => {
                warn!("Status desconhecido: {}", payload.status);
                return (
                    StatusCode::BAD_REQUEST,
                    Json(PixWebhookResponse {
                        status: "error".to_string(),
                        message: format!("Status desconhecido: {}", payload.status),
                    }),
                );
            }
        };

        if status != PixStatus::Paid {
            info!("⏭️ Webhook ignorado (status: {:?})", status);
            return (
                StatusCode::OK,
                Json(PixWebhookResponse {
                    status: "ignored".to_string(),
                    message: format!("Status {:?} ignorado", status),
                }),
            );
        }

        let dpid = payload.metadata
            .as_ref()
            .and_then(|m| m.get("dpid").and_then(|v| v.as_str()))
            .unwrap_or("unknown");

        let amount = payload.paid_amount.unwrap_or(0.0);

        info!("💰 Pagamento Pix confirmado: dPID={}, BRL={:.2}", dpid, amount);

        match state.process_royalty_distribution(dpid, amount, &payload).await {
            Ok(tx_hash) => {
                info!("✅ Royalties distribuídos com sucesso. Tx: {}", tx_hash);
                (
                    StatusCode::OK,
                    Json(PixWebhookResponse {
                        status: "success".to_string(),
                        message: format!("Royalties distribuídos. Tx: {}", tx_hash),
                    }),
                )
            }
            Err(e) => {
                error!("❌ Erro na distribuição de royalties: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(PixWebhookResponse {
                        status: "error".to_string(),
                        message: format!("Erro na distribuição: {}", e),
                    }),
                )
            }
        }
    }

    async fn verify_signature(&self, _payload: &PixWebhookRequest) -> bool {
        true
    }

    async fn process_royalty_distribution(
        &self,
        dpid: &str,
        amount_brl: f64,
        _payload: &PixWebhookRequest,
    ) -> Result<String, String> {
        let mut orchestrator = self.orchestrator.lock().await;

        let node = orchestrator.get_desci_node(dpid)
            .ok_or_else(|| format!("Node {} não encontrado", dpid))?;

        let config = node.royalty_config.as_ref()
            .ok_or("Node não tem royalties configurados")?;

        let usdc_amount = if config.currency == "BRL" {
            let rate = orchestrator.get_brl_usdc_rate().await?;
            (amount_brl / rate * 1_000_000.0) as u64
        } else {
            amount_brl as u64
        };

        if let Some(basket) = &config.picnic_basket {
            let picnic_manager = crate::integrations::picnic::PicnicRoyaltyManager::new(
                &std::env::var("RPC_URL").unwrap_or_default(),
                &std::env::var("PRIVATE_KEY").unwrap_or_default(),
                basket.parse().map_err(|_| "Basket inválido")?,
            )?;
            let tx_hash = picnic_manager.deposit_and_distribute(usdc_amount, &config.royalty_split).await?;
            return Ok(format!("{:?}", tx_hash));
        }

        let pix_splits: Vec<(String, f32)> = config.royalty_split.iter()
            .filter_map(|s| s.pix_key.clone().map(|pk| (pk, s.share)))
            .collect();

        if !pix_splits.is_empty() {
            let mut recipients = Vec::new();
            for (pix_key, share) in pix_splits {
                recipients.push((pix_key, amount_brl * share as f64));
            }
            orchestrator.distribute_via_pix(recipients).await?;
            return Ok("Distribuição via Pix realizada".to_string());
        }

        Err("Nenhum método de distribuição configurado".to_string())
    }
}

pub async fn run_pix_webhook_server(
    orchestrator: Arc<tokio::sync::Mutex<SecondSelfOrchestrator>>,
    gateway: crate::integrations::pix::PixGateway,
    port: u16,
) -> Result<(), String> {
    let handler = Arc::new(PixWebhookHandler::new(orchestrator, gateway));

    let app = Router::new()
        .route("/webhooks/pix", post(PixWebhookHandler::handle_webhook))
        .with_state(handler);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .map_err(|e| format!("Erro ao iniciar servidor: {}", e))?;

    info!("🚀 Servidor de webhook Pix rodando em http://0.0.0.0:{}", port);
    axum::serve(listener, app)
        .await
        .map_err(|e| format!("Erro no servidor: {}", e))?;

    Ok(())
}
