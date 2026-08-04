// src/integrations/bittensor/sn62_ridges.rs
//! Integração com a SN62 (Ridges) para correção de código.

use super::*;
use serde::{Deserialize, Serialize};

// ─── Tipos ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct RidgesFixRequest {
    pub code: String,
    pub language: String,
    pub issue_description: String,
    pub context: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RidgesFixResponse {
    pub fixed_code: String,
    pub explanation: String,
    pub confidence: f32,
    pub alternative_fixes: Option<Vec<String>>,
}

// ─── Cliente SN62 ──────────────────────────────────────────────────────────

pub struct RidgesClient {
    bittensor: Arc<BittensorClient>,
    subnet_id: u16,
}

impl RidgesClient {
    pub fn new(bittensor: Arc<BittensorClient>) -> Self {
        Self {
            bittensor,
            subnet_id: 62,
        }
    }

    /// Corrige um problema de código
    pub async fn fix_code(
        &self,
        code: &str,
        language: &str,
        issue: &str,
    ) -> Result<RidgesFixResponse> {
        let request = RidgesFixRequest {
            code: code.to_string(),
            language: language.to_string(),
            issue_description: issue.to_string(),
            context: None,
        };

        let responses = self.bittensor
            .query_subnet_with_fallback::<_, RidgesFixResponse>(
                self.subnet_id,
                "fix",
                &request,
                3,
                1,
            )
            .await?;

        let best = &responses[0];
        best.data.clone().ok_or_else(|| anyhow!("Resposta vazia da SN62"))
    }
    /*
    /// Corrige uma vulnerabilidade específica (integrado com SN60)
    pub async fn fix_vulnerability(
        &self,
        code: &str,
        language: &str,
        vulnerability: &crate::integrations::openant::Vulnerability,
    ) -> Result<String> {
        let issue = format!(
            "Vulnerabilidade: {} - {}",
            vulnerability.title,
            vulnerability.description
        );

        let response = self.fix_code(code, language, &issue).await?;
        Ok(response.fixed_code)
    }
    */
}
