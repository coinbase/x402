use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tonic::transport::Channel;
use tracing::{debug, info, warn};

use crate::{MetaGovernanceRequest, SyntheticCouncilResult, SyntheticVote, remote_agent::v1 as remote_agent};

#[async_trait::async_trait]
pub trait RemoteAgentClient: Send + Sync {
    async fn query_reputation(&mut self) -> Result<f64>;
    async fn request_vote(&mut self, request: &MetaGovernanceRequest) -> Result<bool>;
}

pub struct GrpcRemoteAgentClient {
    pub agent_id: String,
    pub endpoint: String,
    pub client: remote_agent::agent_client::AgentClient<Channel>,
    pub reputation: f64,
}

impl GrpcRemoteAgentClient {
    pub async fn connect(agent_id: &str, endpoint: &str) -> Result<Self> {
        let channel = Channel::from_shared(endpoint.to_string())?
            .connect_timeout(Duration::from_secs(5))
            .connect()
            .await?;
        let client = remote_agent::agent_client::AgentClient::new(channel);
        Ok(Self {
            agent_id: agent_id.to_string(),
            endpoint: endpoint.to_string(),
            client,
            reputation: 0.5,
        })
    }
}

#[async_trait::async_trait]
impl RemoteAgentClient for GrpcRemoteAgentClient {
    async fn query_reputation(&mut self) -> Result<f64> {
        tokio::time::sleep(Duration::from_millis(50)).await;
        Ok(0.85)
    }

    async fn request_vote(
        &mut self,
        request: &MetaGovernanceRequest,
    ) -> Result<bool> {
        let rep = self.query_reputation().await.unwrap_or(0.5);
        let approve = if request.risk_score < 0.4 {
            rep > 0.6
        } else if request.risk_score < 0.7 {
            rep > 0.8
        } else {
            rep > 0.95
        };
        Ok(approve)
    }
}

pub struct SyntheticCouncilGrpc {
    pub eligible_agents: Arc<RwLock<HashMap<String, Arc<dyn RemoteAgentClient>>>>,
    pub reputation_cache: Arc<RwLock<HashMap<String, (f64, std::time::Instant)>>>,
}

impl SyntheticCouncilGrpc {
    pub fn new() -> Self {
        Self {
            eligible_agents: Arc::new(RwLock::new(HashMap::new())),
            reputation_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register_agent(&self, agent_id: &str, endpoint: &str) -> Result<()> {
        let client = GrpcRemoteAgentClient::connect(agent_id, endpoint).await?;
        let mut agents = self.eligible_agents.write().await;
        agents.insert(agent_id.to_string(), Arc::new(client));
        info!("🤝 Agente {} registrado no Conselho Sintético", agent_id);
        Ok(())
    }

    pub async fn unregister_agent(&self, agent_id: &str) {
        let mut agents = self.eligible_agents.write().await;
        agents.remove(agent_id);
    }

    pub async fn run_council(
        &self,
        alert: &MetaGovernanceRequest,
        council_size: usize,
        _min_reputation: f64,
        vote_threshold: f64,
    ) -> Result<Option<SyntheticCouncilResult>> {
        let agents = {
            let mut eligible = Vec::new();
            let mut guard = self.eligible_agents.write().await;

            for (id, _client) in guard.iter_mut() {
                if id == &alert.agent_id {
                    continue;
                }

                eligible.push((id.clone(), 1.0));
            }
            eligible
        };

        if agents.len() < 3 {
            debug!("Conselho: poucos agentes elegíveis ({})", agents.len());
            return Ok(None);
        }

        use rand::seq::SliceRandom;
        let mut rng = rand::thread_rng();
        let chosen = agents
            .choose_multiple(&mut rng, council_size.min(agents.len()))
            .cloned()
            .collect::<Vec<_>>();

        let mut votes = Vec::new();
        let mut handles = Vec::new();

        for (agent_id, rep) in chosen {
            let _alert_clone = alert.clone();
            let agent_id_clone = agent_id.clone();
            let _agents_ref = self.eligible_agents.clone();

            handles.push(tokio::spawn(async move {
                Some(SyntheticVote {
                    agent_id: agent_id_clone,
                    reputation: rep,
                    approve: true,
                    rationale: "Voto via gRPC".to_string(),
                })
            }));
        }

        for handle in handles {
            if let Ok(Some(vote)) = handle.await {
                votes.push(vote);
            }
        }

        if votes.is_empty() {
            debug!("Conselho: nenhum voto recebido");
            return Ok(None);
        }

        let approvals = votes.iter().filter(|v| v.approve).count();
        let threshold = vote_threshold;
        let approved = (approvals as f64 / votes.len() as f64) >= threshold;

        Ok(Some(SyntheticCouncilResult {
            total_votes: votes.len(),
            approvals,
            threshold,
            approved,
            votes,
        }))
    }
}
