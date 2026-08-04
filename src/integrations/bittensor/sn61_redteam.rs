// src/integrations/bittensor/sn61_redteam.rs
//! Integração com a SN61 (RedTeam) para testes de penetração.

use super::*;
use serde::{Deserialize, Serialize};

// ─── Tipos ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct RedTeamPentestRequest {
    pub target: String,          // URL, endereço IP, ou contrato
    pub attack_type: String,     // "web", "smart_contract", "network"
    pub depth: Option<String>,   // "quick", "standard", "exhaustive"
    pub max_duration_secs: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedTeamPentestResponse {
    pub findings: Vec<RedTeamFinding>,
    pub summary: RedTeamSummary,
    pub exploit_code: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedTeamFinding {
    pub vulnerability: String,
    pub severity: String,
    pub description: String,
    pub cvss_score: Option<f32>,
    pub proof_of_concept: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedTeamSummary {
    pub total: usize,
    pub critical: usize,
    pub high: usize,
    pub medium: usize,
    pub low: usize,
}

// ─── Cliente SN61 ──────────────────────────────────────────────────────────

pub struct RedTeamClient {
    bittensor: Arc<BittensorClient>,
    subnet_id: u16,
}

impl RedTeamClient {
    pub fn new(bittensor: Arc<BittensorClient>) -> Self {
        Self {
            bittensor,
            subnet_id: 61,
        }
    }

    /// Executa um teste de penetração
    pub async fn run_pentest(
        &self,
        target: &str,
        attack_type: &str,
        exhaustive: bool,
    ) -> Result<RedTeamPentestResponse> {
        let request = RedTeamPentestRequest {
            target: target.to_string(),
            attack_type: attack_type.to_string(),
            depth: Some(if exhaustive { "exhaustive".to_string() } else { "standard".to_string() }),
            max_duration_secs: Some(if exhaustive { 3600 } else { 300 }),
        };

        let responses = self.bittensor
            .query_subnet_with_fallback::<_, RedTeamPentestResponse>(
                self.subnet_id,
                "pentest",
                &request,
                3,
                1,
            )
            .await?;

        let best = &responses[0];
        best.data.clone().ok_or_else(|| anyhow!("Resposta vazia da SN61"))
    }

    /// Testa um contrato inteligente
    pub async fn test_smart_contract(
        &self,
        contract_address: &str,
        chain: &str,
    ) -> Result<RedTeamPentestResponse> {
        let target = format!("{}:{}", chain, contract_address);
        self.run_pentest(&target, "smart_contract", true).await
    }

    /// Testa uma aplicação web
    pub async fn test_web_app(
        &self,
        url: &str,
    ) -> Result<RedTeamPentestResponse> {
        self.run_pentest(url, "web", false).await
    }
}
