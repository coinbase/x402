use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::cathedral::v1::{GovernanceRequest, GovernanceResponse, GovernanceVerdict};
use crate::tree_validator::TreeManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HierarchicalGovernanceConfig {
    pub role_risk_limits: HashMap<String, f64>,
    pub min_reputation_for_high_risk: f64,
    pub reputation_weight: f64,
    pub risk_weight: f64,
}

impl Default for HierarchicalGovernanceConfig {
    fn default() -> Self {
        let mut map = HashMap::new();
        map.insert("coordinator".to_string(), 0.8);
        map.insert("designer".to_string(), 0.6);
        map.insert("worker".to_string(), 0.4);
        Self {
            role_risk_limits: map,
            min_reputation_for_high_risk: 0.7,
            reputation_weight: 0.3,
            risk_weight: 0.7,
        }
    }
}

pub struct HierarchicalEthicalGuardian {
    config: HierarchicalGovernanceConfig,
    _tree_manager: Arc<RwLock<TreeManager>>,
    decision_history: Arc<RwLock<Vec<GovernanceRequest>>>,
}

impl HierarchicalEthicalGuardian {
    pub fn new(
        config: HierarchicalGovernanceConfig,
        tree_manager: Arc<RwLock<TreeManager>>,
        _human_review_queue: tokio::sync::mpsc::Sender<()>,
    ) -> Self {
        Self {
            config,
            _tree_manager: tree_manager,
            decision_history: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn evaluate(&self, request: &GovernanceRequest) -> Result<GovernanceResponse> {
        let risk = request.agent_risk_score;

        let reputation = request
            .metadata
            .get("reputation")
            .and_then(|v| v.parse::<f64>().ok())
            .unwrap_or(0.5);

        let domain = request.domain.as_deref().unwrap_or("unknown");

        let role = if let Some(identity) = &request.agent_identity {
            identity.role.clone()
        } else {
            "unknown".to_string()
        };
        let role_limit = self.config.role_risk_limits.get(&role).copied().unwrap_or(0.5);

        let history = self.decision_history.read().await;
        let rejections = history.iter()
            .filter(|r| r.agent_id == request.agent_id && r.agent_risk_score > 0.7)
            .count();

        let mut score = self.config.risk_weight * risk
            + self.config.reputation_weight * (1.0 - reputation);

        score += (rejections as f64).min(3.0) * 0.05;

        let domain_critical = matches!(domain, "aerospace" | "medical" | "nuclear");
        if domain_critical && reputation < self.config.min_reputation_for_high_risk {
            score += 0.2;
        }

        let verdict = if score < 0.3 {
            GovernanceVerdict::GovApproved
        } else if score < 0.6 {
            GovernanceVerdict::GovConditional
        } else if score < 0.8 {
            GovernanceVerdict::RequiresHuman
        } else {
            GovernanceVerdict::GovRejected
        };

        {
            let mut history = self.decision_history.write().await;
            history.push(request.clone());
            if history.len() > 1000 { history.drain(0..100); }
        }

        info!(
            "Governança: agente={}, risco={:.2}, rep={:.2}, score={:.2}, veredito={:?}",
            request.agent_id, risk, reputation, score, verdict
        );

        Ok(GovernanceResponse {
            request_id: request.request_id.clone(),
            verdict: verdict as i32,
            rationale: format!("score={:.2}, risk={:.2}, rep={:.2}, role_limit={:.2}", score, risk, reputation, role_limit),
            conditions: if verdict == GovernanceVerdict::GovConditional {
                vec!["Revisão humana adicional recomendada".to_string()]
            } else {
                vec![]
            },
            evaluated_by: "hierarchical-multi".to_string(),
            evaluated_at: Some(prost_types::Timestamp {
                seconds: chrono::Utc::now().timestamp(),
                nanos: 0,
            }),
            decision_hash: vec![],
        })
    }

    pub async fn evaluate_meta(&self, request: &crate::cathedral::v1::MetaGovernanceRequest) -> Result<crate::cathedral::v1::MetaGovernanceResponse> {
        use crate::cathedral::v1::{MetaGovernanceResponse, MetaGovernanceVerdict};
        let risk = request.risk_score;
        let verdict = if risk < 0.4 {
            MetaGovernanceVerdict::MetaApproved
        } else if risk < 0.7 {
            MetaGovernanceVerdict::MetaConditional
        } else {
            MetaGovernanceVerdict::RequiresCemReview
        };
        Ok(MetaGovernanceResponse {
            request_id: request.request_id.clone(),
            verdict: verdict as i32,
            rationale: format!("meta-risk={:.2}", risk),
            conditions: vec![],
            evaluated_by: "hierarchical".to_string(),
            evaluated_at: Some(prost_types::Timestamp {
                seconds: chrono::Utc::now().timestamp(),
                nanos: 0,
            }),
            decision_hash: None,
            jira_issue_key: None,
        })
    }
}
