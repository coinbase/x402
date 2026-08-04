use tonic::{Request, Response, Status};

pub mod pb {
    tonic::include_proto!("cathedral.v1");
}

use pb::cathedral_bridge_server::CathedralBridge;
use pb::{
    GovernanceRequest, GovernanceResponse, GovernanceVerdict, IngestRequest,
    IngestResponse, QueryProvenanceRequest, QueryProvenanceResponse,
};

#[derive(Debug, Default)]
pub struct MyCathedralBridge {}

#[tonic::async_trait]
impl CathedralBridge for MyCathedralBridge {
    async fn ingest(
        &self,
        request: Request<IngestRequest>,
    ) -> Result<Response<IngestResponse>, Status> {
        println!("Got a request: {:?}", request);

        let req = request.into_inner();

        let response = IngestResponse {
            success: true,
            message: "Events ingested successfully".to_string(),
            events_accepted: req.events.len() as u32,
            rejected_event_ids: vec![],
        };

        Ok(Response::new(response))
    }

    async fn request_governance(
        &self,
        request: Request<GovernanceRequest>,
    ) -> Result<Response<GovernanceResponse>, Status> {
        println!("Got a governance request: {:?}", request);

        let req = request.into_inner();

        let response = GovernanceResponse {
            request_id: req.request_id,
            verdict: GovernanceVerdict::Approved as i32,
            rationale: "Approved by stub".to_string(),
            conditions: vec![],
            evaluated_by: "stub".to_string(),
            evaluated_at: Some(prost_types::Timestamp::date_time_nanos(2026, 6, 19, 0, 0, 0, 0).unwrap_or_default()),
        };

        Ok(Response::new(response))
    }

    async fn query_provenance(
        &self,
        request: Request<QueryProvenanceRequest>,
    ) -> Result<Response<QueryProvenanceResponse>, Status> {
        println!("Got a query request: {:?}", request);

        let response = QueryProvenanceResponse {
            entries: vec![],
            has_more: false,
        };

        Ok(Response::new(response))
    }
}
