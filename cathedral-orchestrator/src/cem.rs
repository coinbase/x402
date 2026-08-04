//! src/cem.rs
//! Selo: CATHEDRAL-ARKHE-ASI-CEM-v1.0.0

use anyhow::Result;
use tracing::info;
use crate::observer_5d::MetaGovernanceRequest;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MetaGovernanceVerdict {
    Approved,
    Rejected,
    RequiresCemReview,
    Conditional,
    Deferred,
}

pub struct CemAdapter {
    pub project_key: String,
    pub cem_agent_id: String,
}

impl CemAdapter {
    pub fn new(project_key: &str, cem_agent_id: &str) -> Self {
        Self {
            project_key: project_key.to_string(),
            cem_agent_id: cem_agent_id.to_string(),
        }
    }

    /// Receives a MetaGovernanceRequest and triggers a CEM review.
    /// In a real implementation, this would create an issue in Jira or notify stakeholders.
    pub async fn process_request(&self, req: &MetaGovernanceRequest) -> Result<String> {
        info!("📋 CEM ({}) processando solicitação: {} para o agente {}", self.cem_agent_id, req.action, req.agent_id);

        let summary = format!("CEM Review: {} (agent: {})", req.action, req.agent_id);
        let issue_key = format!("{}-{}", self.project_key, uuid::Uuid::new_v4().to_string().chars().take(8).collect::<String>());

        info!("📋 CEM issue criada: {} - {}", issue_key, summary);

        Ok(issue_key)
    }

    /// Evaluates a pending issue and issues a verdict based on risk and context.
    /// In a real scenario, humans or high-reputation AI agents would input this.
    pub async fn evaluate_issue(&self, issue_key: &str, risk_score: f64) -> Result<MetaGovernanceVerdict> {
        info!("⚖️ CEM avaliando issue: {}", issue_key);

        let verdict = if risk_score > 0.9 {
            MetaGovernanceVerdict::Rejected
        } else if risk_score > 0.7 {
            MetaGovernanceVerdict::Conditional
        } else {
            MetaGovernanceVerdict::Approved
        };

        info!("⚖️ CEM veredito para issue {}: {:?}", issue_key, verdict);

        Ok(verdict)
    }
}
