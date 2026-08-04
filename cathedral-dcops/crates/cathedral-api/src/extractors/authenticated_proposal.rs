use axum::{
    async_trait,
    extract::{FromRequestParts, Path, Query, State},
    http::request::Parts,
    response::Response,
};
use axum::extract::FromRef;
use crate::{AppState, ApiError, auth::verify_auth, routes::proposals::ProposalQueryParams};
use std::sync::Arc;
use cathedral_wormgraph::ImprovementProposal;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(untagged)]
pub enum ProposalIdentifier {
    Path { id: String },
    Query { id: String },
    Body { id: String },
}

pub struct AuthenticatedProposal {
    pub proposal: ImprovementProposal,
    pub did: String,
    pub signature: Vec<u8>,
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthenticatedProposal
where
    S: Send + Sync,
    Arc<AppState>: FromRef<S>,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let did = parts.headers
            .get("X-DID")
            .and_then(|v| v.to_str().ok())
            .ok_or(ApiError::MissingDid)?
            .to_string();
        let signature = parts.headers
            .get("X-Signature")
            .and_then(|v| hex::decode(v.as_bytes()).ok())
            .ok_or(ApiError::MissingSignature)?;

        // Extrai ID de Path, Query ou Body
        let id = if let Some(path) = parts.extensions.get::<Path<String>>() {
            path.clone().0
        } else if let Some(query) = parts.extensions.get::<Query<ProposalQueryParams>>() {
            query.id.clone().ok_or(ApiError::MissingId)?
        } else {
            // Extrai do corpo (requer middleware de corpo)
            let body = parts.extensions
                .get::<Vec<u8>>()
                .ok_or(ApiError::MissingId)?;
            let json: serde_json::Value = serde_json::from_slice(body)
                .map_err(|_| ApiError::InvalidPayload)?;
            json["id"].as_str().ok_or(ApiError::MissingId)?.to_string()
        };

        let app_state = Arc::from_ref(state);
        let proposal = app_state.wormgraph
            .get_proposal(&id)
            .await.unwrap()
            .ok_or(ApiError::NotFound)?;

        if proposal.author_did != did {
            return Err(ApiError::Forbidden.into());
        }

        let payload = serde_json::to_vec(&proposal)
            .map_err(|_| ApiError::InvalidPayload)?;
        verify_auth(&did, &signature, &payload).await.unwrap();

        Ok(AuthenticatedProposal { proposal, did, signature })
    }
}

pub struct AuthenticatedDid {
    pub did: String,
    pub signature: Vec<u8>,
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthenticatedDid
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let did = parts
            .headers
            .get("X-DID")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| ApiError::MissingDid)?
            .to_string();

        let signature = parts
            .headers
            .get("X-Signature")
            .and_then(|v| hex::decode(v.as_bytes()).ok())
            .ok_or_else(|| ApiError::MissingSignature)?;

        Ok(AuthenticatedDid { did, signature })
    }
}
