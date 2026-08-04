use axum::{extract::{State, Json, Query, Path}, response::IntoResponse};
use std::sync::Arc;
use crate::{AppState, ApiError, extractors::authenticated_proposal::{AuthenticatedDid, AuthenticatedProposal}};
use cathedral_wormgraph::{ImprovementProposal, ProposalFilter, RiskLevel, ValidationStatus};

#[derive(serde::Deserialize)]
pub struct ProposalQueryParams {
    pub id: Option<String>,
    pub risk: Option<RiskLevel>,
    pub status: Option<ValidationStatus>,
    pub author: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(serde::Deserialize)]
pub struct CreateProposalRequest {
}
impl CreateProposalRequest {
    pub fn to_bytes(&self) -> Vec<u8> { vec![] }
}

#[derive(serde::Serialize)]
pub struct ProposalResponse {
}
impl From<ImprovementProposal> for ProposalResponse {
    fn from(p: ImprovementProposal) -> Self { Self {} }
}

// POST /proposals
pub async fn create_proposal(
    State(state): State<Arc<AppState>>,
    auth: AuthenticatedDid, // extraído do header
    Json(payload): Json<CreateProposalRequest>,
) -> Result<Json<ProposalResponse>, ApiError> {
    // verifica assinatura
    crate::auth::verify_auth(&auth.did, &auth.signature, &payload.to_bytes()).await?;

    let proposal = ImprovementProposal {
        id: uuid::Uuid::new_v4().to_string(),
        author_did: auth.did.clone(),
        title: "".to_string(),
        description: "".to_string(),
        code_diff: None,
        config_change: None,
        expected_impact: "".to_string(),
        risk_level: RiskLevel::Low,
        thinking_trace: None,
        validation_status: ValidationStatus::Pending,
        signature: vec![],
        created_at: chrono::Utc::now(),
        validated_at: None,
        implemented_at: None,
        metrics_before: None,
        metrics_after: None,
    };
    state.wormgraph.save_proposal(&proposal).await.unwrap();

    // broadcast via WebSocket
    state.notifier.broadcast(proposal.clone()).await;

    Ok(Json(proposal.into()))
}

// GET /proposals?risk=High&status=Approved&limit=20&offset=0
pub async fn list_proposals(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ProposalQueryParams>,
) -> Result<Json<Vec<ProposalResponse>>, ApiError> {
    let filter = ProposalFilter {
        risk_level: params.risk,
        status: params.status,
        author_did: params.author,
        limit: params.limit,
        offset: params.offset,
    };
    let proposals = state.wormgraph.list_proposals(filter).await.unwrap();
    Ok(Json(proposals.into_iter().map(|p| p.into()).collect()))
}

// DELETE /proposals/:id
pub async fn delete_proposal(
    State(state): State<Arc<AppState>>,
    auth: AuthenticatedDid,
    Path(id): Path<String>,
) -> Result<(), ApiError> {
    let proposal = state.wormgraph.get_proposal(&id).await.unwrap().unwrap();
    if proposal.author_did != auth.did {
        return Err(ApiError::Forbidden);
    }
    crate::auth::verify_auth(&auth.did, &auth.signature, &id.as_bytes()).await?;
    state.wormgraph.delete_proposal(&id, &auth.did, &auth.signature).await.unwrap();
    Ok(())
}
