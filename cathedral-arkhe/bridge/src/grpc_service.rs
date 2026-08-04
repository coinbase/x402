use std::sync::Arc;
use tokio::sync::RwLock;
use tonic::{Request, Response, Status};
use tracing::{error, info, debug};

use crate::cathedral::v1::{
    cathedral_bridge_server::CathedralBridge,
    IngestRequest, IngestResponse,
    GovernanceRequest, GovernanceResponse,
    CreateAgentRequest, CreateAgentResponse,
    AgentSelfMutation, MutateAgentResponse,
    QueryProvenanceRequest, QueryProvenanceResponse,
    MetaGovernanceRequest, MetaGovernanceResponse,
    ProvenanceEntry, Event,
};
use crate::tree_validator::TreeManager;
use crate::wormgraph_client::WormGraphClient;
use crate::governance_hook::HierarchicalEthicalGuardian;
use crate::ethical_filter::EthicalFilter;
use crate::metrics::{EVENTS_ACCEPTED, EVENTS_REJECTED, INGEST_LATENCY};

pub struct CathedralGrpcService {
    tree_manager: Arc<RwLock<TreeManager>>,
    wormgraph: Arc<WormGraphClient>,
    guardian: Arc<HierarchicalEthicalGuardian>,
    ethical_filter: Arc<EthicalFilter>,
}

impl CathedralGrpcService {
    pub fn new(
        tree_manager: Arc<RwLock<TreeManager>>,
        wormgraph: Arc<WormGraphClient>,
        guardian: Arc<HierarchicalEthicalGuardian>,
    ) -> Self {
        Self {
            tree_manager,
            wormgraph,
            guardian,
            ethical_filter: Arc::new(EthicalFilter::new()),
        }
    }

    fn validate_event(&self, event: &Event) -> Result<(), String> {
        if event.event_id.is_empty() {
            return Err("event_id vazio".to_string());
        }
        if event.payload_json.is_empty() {
            return Err("payload_json vazio".to_string());
        }
        if !serde_json::from_str::<serde_json::Value>(&event.payload_json).is_ok() {
            return Err("payload_json não é JSON válido".to_string());
        }
        Ok(())
    }

    fn verify_agent_signature(
        &self,
        _agent_id: &str,
        signature: &[u8],
        _events: &[Event],
    ) -> Result<(), String> {
        if signature.is_empty() {
            return Err("Assinatura vazia".to_string());
        }
        Ok(())
    }

    fn compute_merkle_root(&self, leaves: &[Vec<u8>]) -> Vec<u8> {
        if leaves.is_empty() {
            return vec![];
        }
        let mut current = leaves.to_vec();
        while current.len() > 1 {
            let mut next = Vec::new();
            for chunk in current.chunks(2) {
                if chunk.len() == 2 {
                    let mut hasher = blake3::Hasher::new();
                    hasher.update(&chunk[0]);
                    hasher.update(&chunk[1]);
                    next.push(hasher.finalize().as_bytes().to_vec());
                } else {
                    next.push(chunk[0].clone());
                }
            }
            current = next;
        }
        current.into_iter().next().unwrap_or_default()
    }

    fn convert_to_proto_entry(&self, entry: crate::wormgraph_client::ProvenanceEvent) -> ProvenanceEntry {
        ProvenanceEntry {
            id: entry.event_id,
            version: 1,
            decision_type: entry.event_type,
            before_state_json: "{}".to_string(),
            after_state_json: entry.payload.to_string(),
            rationale: None,
            timestamp: Some(prost_types::Timestamp {
                seconds: entry.timestamp,
                nanos: 0,
            }),
            agent_id: entry.agent_id,
            agent_identity: None,
        }
    }
}

#[tonic::async_trait]
impl CathedralBridge for CathedralGrpcService {
    async fn ingest(&self, request: Request<IngestRequest>) -> Result<Response<IngestResponse>, Status> {
        let req = request.into_inner();
        let start_time = std::time::Instant::now();
        info!("📥 Ingest: project={}, agent={}, events={}",
            req.project_id, req.agent_id, req.events.len());

        let mut accepted = 0;
        let mut rejected = Vec::new();
        let mut merkle_leaves = Vec::new();

        if let Some(sig) = &req.agent_signature {
            if let Err(e) = self.verify_agent_signature(&req.agent_id, sig, &req.events) {
                error!("Assinatura inválida para agente {}: {}", req.agent_id, e);
                return Err(Status::unauthenticated(format!("Assinatura inválida: {}", e)));
            }
        }

        for event in req.events {
            if let Err(e) = self.validate_event(&event) {
                error!("Evento inválido {}: {}", event.event_id, e);
                rejected.push(event.event_id);
                continue;
            }

            let payload = serde_json::from_str::<serde_json::Value>(&event.payload_json)
                .map_err(|e| Status::invalid_argument(format!("JSON inválido: {}", e)))?;

            match self.ethical_filter.evaluate(&payload).await {
                Ok(true) => {
                    match self.wormgraph.append_event(event.clone()).await {
                        Ok(entry) => {
                            merkle_leaves.push(entry.entry_hash.clone());
                            accepted += 1;
                            debug!("Evento {} aceito", event.event_id);
                        }
                        Err(e) => {
                            error!("Falha ao persistir evento {}: {}", event.event_id, e);
                            rejected.push(event.event_id);
                        }
                    }
                }
                Ok(false) => {
                    debug!("Evento {} rejeitado pelo filtro ético", event.event_id);
                    rejected.push(event.event_id);
                }
                Err(e) => {
                    error!("Erro no filtro ético para {}: {}", event.event_id, e);
                    rejected.push(event.event_id);
                }
            }
        }

        let merkle_root = if merkle_leaves.is_empty() {
            None
        } else {
            Some(self.compute_merkle_root(&merkle_leaves))
        };

        let elapsed = start_time.elapsed();

        EVENTS_ACCEPTED.inc_by((accepted as u64) as f64);
        EVENTS_REJECTED.inc_by((rejected.len() as u64) as f64);
        INGEST_LATENCY.observe(elapsed.as_secs_f64());

        info!("✅ Ingest concluído: {}/{} aceitos em {:.2?}",
            accepted, accepted + rejected.len(), elapsed);

        Ok(Response::new(IngestResponse {
            success: rejected.is_empty(),
            message: format!("Accepted {}/{} events", accepted, accepted + rejected.len()),
            events_accepted: accepted as u32,
            rejected_event_ids: rejected,
            bridge_timestamp: chrono::Utc::now().to_rfc3339(),
            merkle_root,
            tree_provenance_hash: None,
        }))
    }

    async fn query_provenance(
        &self,
        request: Request<QueryProvenanceRequest>,
    ) -> Result<Response<QueryProvenanceResponse>, Status> {
        let req = request.into_inner();
        debug!("🔍 Query: project={}, design_hash={:?}, agent={:?}",
            req.project_id, req.design_hash, req.agent_id);

        let limit = if req.limit == 0 { 100 } else { req.limit as usize };

        let entries = self.wormgraph.query(
            Some(&req.project_id),
            req.design_hash.as_deref(),
            req.agent_id.as_deref(),
            req.tree_id.as_deref(),
            limit,
        ).await.map_err(|e| {
            error!("Erro na query: {}", e);
            Status::internal(e.to_string())
        })?;

        let proto_entries: Vec<ProvenanceEntry> = entries
            .into_iter()
            .map(|e| self.convert_to_proto_entry(e))
            .collect();

        let has_more = proto_entries.len() >= limit;

        Ok(Response::new(QueryProvenanceResponse {
            entries: proto_entries.clone(),
            has_more,
            total_count: proto_entries.len() as u64,
            nostr_event_ids: vec![],
            tree_snapshot: None,
        }))
    }

    async fn request_meta_governance(&self, request: Request<MetaGovernanceRequest>) -> Result<Response<MetaGovernanceResponse>, Status> {
        let req = request.into_inner();
        let response = self.guardian.evaluate_meta(&req).await
            .map_err(|e| Status::internal(e.to_string()))?;
        Ok(Response::new(response))
    }

    async fn create_agent(&self, request: Request<CreateAgentRequest>) -> Result<Response<CreateAgentResponse>, Status> {
        let req = request.into_inner();
        let tree_id = req.tree_id.as_deref().unwrap_or("default-tree");
        let mut manager = self.tree_manager.write().await;
        let created = manager.create_agent_dynamic(
            tree_id,
            &req.parent_agent_id,
            &req.new_agent_id,
            &req.role,
            &req.config,
            req.recursive,
        ).map_err(|e| Status::invalid_argument(e.to_string()))?;
        Ok(Response::new(CreateAgentResponse {
            success: true,
            agent_id: req.new_agent_id,
            tree_id: tree_id.to_string(),
            message: format!("Created with {} subagents", created.len() - 1),
        }))
    }

    async fn mutate_agent(&self, request: Request<AgentSelfMutation>) -> Result<Response<MutateAgentResponse>, Status> {
        let req = request.into_inner();
        let tree_id = req.tree_id.as_deref().unwrap_or("default-tree");
        let mut manager = self.tree_manager.write().await;
        let affected = manager.apply_mutation_recursively(
            tree_id,
            &req.agent_id,
            &req.mutation_type,
            req.new_role.as_deref(),
            Some(&req.new_config),
            req.patch.as_deref(),
        ).map_err(|e| Status::invalid_argument(e.to_string()))?;
        Ok(Response::new(MutateAgentResponse {
            success: true,
            message: format!("Applied to {} agents", affected),
            affected_agents: affected,
        }))
    }

    async fn request_governance(&self, request: Request<GovernanceRequest>) -> Result<Response<GovernanceResponse>, Status> {
        let req = request.into_inner();
        let response = self.guardian.evaluate(&req).await.map_err(|e| Status::internal(e.to_string()))?;
        Ok(Response::new(response))
    }
}
