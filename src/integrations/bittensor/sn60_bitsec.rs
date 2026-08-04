// src/integrations/bittensor/sn60_bitsec.rs
//! Integração com a SN60 (Bitsec.ai) para análise de segurança de código.

use super::*;
use serde::{Deserialize, Serialize};

// ─── Tipos ──────────────────────────────────────────────────────────────────

/// Request para análise de segurança
#[derive(Debug, Clone, Serialize)]
pub struct BitsecAnalysisRequest {
    pub code: String,
    pub language: String, // "rust", "python", "javascript", etc.
    pub analysis_depth: Option<String>, // "quick", "standard", "deep"
    pub include_fixes: Option<bool>,
}

/// Vulnerabilidade encontrada pela SN60
#[derive(Debug, Clone, Deserialize)]
pub struct BitsecVulnerability {
    pub id: String,
    pub title: String,
    pub description: String,
    pub severity: String, // "critical", "high", "medium", "low"
    pub location: String, // file:line
    pub cwe_id: Option<String>,
    pub remediation: Option<String>,
}

/// Resposta da análise
#[derive(Debug, Clone, Deserialize)]
pub struct BitsecAnalysisResponse {
    pub vulnerabilities: Vec<BitsecVulnerability>,
    pub summary: BitsecSummary,
    pub suggested_fixes: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BitsecSummary {
    pub total: usize,
    pub critical: usize,
    pub high: usize,
    pub medium: usize,
    pub low: usize,
}

// ─── Cliente SN60 ──────────────────────────────────────────────────────────

pub struct BitsecClient {
    bittensor: Arc<BittensorClient>,
    subnet_id: u16,
}

impl BitsecClient {
    pub fn new(bittensor: Arc<BittensorClient>) -> Self {
        Self {
            bittensor,
            subnet_id: 60,
        }
    }

    /// Analisa código fonte
    pub async fn analyze_code(
        &self,
        code: &str,
        language: &str,
        include_fixes: bool,
    ) -> Result<BitsecAnalysisResponse> {
        let request = BitsecAnalysisRequest {
            code: code.to_string(),
            language: language.to_string(),
            analysis_depth: Some("standard".to_string()),
            include_fixes: Some(include_fixes),
        };

        let responses = self.bittensor
            .query_subnet_with_fallback::<_, BitsecAnalysisResponse>(
                self.subnet_id,
                "analyze",
                &request,
                3,
                1,
            )
            .await?;

        let best = &responses[0];
        best.data.clone().ok_or_else(|| anyhow!("Resposta vazia da SN60"))
    }

    /// Analisa um arquivo inteiro (via caminho)
    pub async fn analyze_file(
        &self,
        file_path: &str,
        language: &str,
    ) -> Result<BitsecAnalysisResponse> {
        let code = std::fs::read_to_string(file_path)?;
        self.analyze_code(&code, language, true).await
    }

    /// Obtém apenas as vulnerabilidades críticas
    pub async fn get_critical_vulnerabilities(
        &self,
        code: &str,
        language: &str,
    ) -> Result<Vec<BitsecVulnerability>> {
        let response = self.analyze_code(code, language, false).await?;
        let critical: Vec<BitsecVulnerability> = response.vulnerabilities
            .into_iter()
            .filter(|v| v.severity == "critical")
            .collect();
        Ok(critical)
    }
}
// ─── Integração com o OpenAnt ──────────────────────────────────────────────
/*
impl crate::integrations::openant::OpenAntClient {
    /// Executa análise de segurança usando SN60 (Bitsec) como complemento
    pub async fn analyze_with_bitsec(
        &self,
        code: &str,
        language: &str,
    ) -> Result<Vec<crate::integrations::openant::Vulnerability>> {
        let bittensor = crate::integrations::bittensor::BittensorClient::new(
            crate::integrations::bittensor::BittensorConfig::default()
        )?;
        let bitsec = BitsecClient::new(Arc::new(bittensor));

        let response = bitsec.analyze_code(code, language, true).await?;

        // Converte para o formato de vulnerabilidade da Cathedral
        let mut vulns = Vec::new();
        for v in response.vulnerabilities {
            vulns.push(crate::integrations::openant::Vulnerability {
                id: v.id,
                title: v.title,
                description: v.description,
                severity: match v.severity.as_str() {
                    "critical" => crate::integrations::openant::Severity::Critical,
                    "high" => crate::integrations::openant::Severity::High,
                    "medium" => crate::integrations::openant::Severity::Medium,
                    "low" => crate::integrations::openant::Severity::Low,
                    _ => crate::integrations::openant::Severity::Info,
                },
                location: v.location,
                cwe_id: v.cwe_id,
                verified: false, // Será verificado pelo OpenAnt
                exploitation_details: None,
                remediation: v.remediation,
                created_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            });
        }

        Ok(vulns)
    }
}
*/
