use tonic::Request;
use pb::cathedral_bridge_client::CathedralBridgeClient;
use pb::{IngestRequest, GovernanceRequest, Event, EventType, EventMetadata, GovernanceVerdict};
use std::collections::HashMap;
use anyhow::Result;
use crate::SdkEvent;

pub mod pb {
    tonic::include_proto!("cathedral.v1");
}

#[derive(Clone)]
pub struct GrpcClient {
    client: CathedralBridgeClient<tonic::transport::Channel>,
}

impl GrpcClient {
    pub async fn new(endpoint: String) -> Result<Self> {
        let client = CathedralBridgeClient::connect(endpoint).await?;
        Ok(Self { client })
    }

    pub async fn ingest(&mut self, project_id: String, agent_id: String, sdk_events: Vec<SdkEvent>) -> Result<pb::IngestResponse> {
        let mut events = Vec::new();

        for sdk_event in sdk_events {
            let (event_type, design_hash, parent_hashes, payload, domain, confidence, compute_cost_usd, tags) = match sdk_event {
                SdkEvent::DesignProposed { design_hash, parent_hashes, parameters, rationale, agent_id } => {
                    let payload = serde_json::json!({"parameters": parameters, "rationale": rationale, "agent_id": agent_id});
                    (EventType::DesignProposed, design_hash, parent_hashes, payload, "design".to_string(), 0.5, 0.0, vec!["design".to_string()])
                },
                SdkEvent::SimulationCompleted { design_hash, simulator, metrics, convergence, compute_cost_usd } => {
                    let payload = serde_json::json!({"simulator": simulator, "metrics": metrics, "convergence": convergence});
                    (EventType::SimulationCompleted, design_hash, vec![], payload, "simulation".to_string(), metrics.get("confidence").copied().unwrap_or(0.5), compute_cost_usd, vec!["simulation".to_string(), simulator])
                },
                SdkEvent::AgentMutation { mutation_description, previous_agent_hash, substrate_version } => {
                    let payload = serde_json::json!({"mutation": mutation_description, "substrate_version": substrate_version});
                    let design_hash = blake3::hash(mutation_description.as_bytes()).to_hex().to_string();
                    (EventType::AgentMutation, design_hash, vec![previous_agent_hash], payload, "meta".to_string(), 0.7, 0.0, vec!["recursive_engineering".to_string()])
                }
            };

            let metadata = EventMetadata {
                domain,
                confidence,
                compute_cost_usd,
                tags,
            };

            let event = Event {
                event_id: uuid::Uuid::new_v4().to_string(),
                timestamp: Some(prost_types::Timestamp::date_time_nanos(2026, 6, 19, 0, 0, 0, 0).unwrap_or_default()), // Using static for stub, use chrono::Utc::now() in prod
                event_type: event_type as i32,
                design_hash,
                parent_hashes,
                payload_json: payload.to_string(),
                metadata: Some(metadata),
            };

            events.push(event);
        }

        let request = Request::new(IngestRequest {
            project_id,
            agent_id,
            events,
            batch_id: Some(uuid::Uuid::new_v4().to_string()),
        });

        let response = self.client.ingest(request).await?;
        Ok(response.into_inner())
    }

    pub async fn request_governance(&mut self, project_id: String, agent_id: String, sdk_event: SdkEvent) -> Result<crate::GovernanceResponse> {
        let (event_type, payload) = match sdk_event {
            SdkEvent::AgentMutation { ref mutation_description, ref previous_agent_hash, ref substrate_version } => {
                let payload = serde_json::json!({"mutation": mutation_description, "substrate_version": substrate_version});
                (EventType::AgentMutation, payload)
            },
            SdkEvent::DesignProposed { ref parameters, ref rationale, ref agent_id, .. } => {
                let payload = serde_json::json!({"parameters": parameters, "rationale": rationale, "agent_id": agent_id});
                (EventType::DesignProposed, payload)
            },
            SdkEvent::SimulationCompleted { ref simulator, ref metrics, convergence, .. } => {
                let payload = serde_json::json!({"simulator": simulator, "metrics": metrics, "convergence": convergence});
                (EventType::SimulationCompleted, payload)
            }
        };

        let request = Request::new(GovernanceRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            project_id,
            agent_id,
            event_type: event_type as i32,
            proposed_state_json: payload.to_string(),
            current_state_json: "{}".to_string(),
            agent_risk_score: 0.5,
            domain: "unknown".to_string(),
            metadata: HashMap::new(),
        });

        let response = self.client.request_governance(request).await?.into_inner();

        let verdict = match response.verdict() {
            GovernanceVerdict::Unspecified => "rejected",
            GovernanceVerdict::Approved => "approved",
            GovernanceVerdict::Rejected => "rejected",
            GovernanceVerdict::RequiresHuman => "requires_human",
            GovernanceVerdict::Conditional => "conditional",
            GovernanceVerdict::Timeout => "timeout",
        }.to_string();

        Ok(crate::GovernanceResponse {
            verdict,
            rationale: response.rationale,
            conditions: if response.conditions.is_empty() { None } else { Some(response.conditions) },
        })
    }
}
