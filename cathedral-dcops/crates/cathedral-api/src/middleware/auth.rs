use axum::{
    async_trait,
    extract::{FromRequestParts, State},
    http::{Request, header},
    middleware::Next,
    response::Response,
};
use crate::AppState;
use std::sync::Arc;

pub struct AuthMiddleware;

pub async fn auth_middleware<B>(
    State(state): State<Arc<AppState>>,
    mut req: Request<B>,
    next: Next<B>,
) -> Response {
    // Valida DID e assinatura, injeta no extensions
    let did = req.headers()
        .get("X-DID")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let signature = req.headers()
        .get("X-Signature")
        .and_then(|v| hex::decode(v.as_bytes()).ok());

    if let (Some(did), Some(sig)) = (did, signature) {
        // Verificação real (pode ser deferida para o handler)
        req.extensions_mut().insert(AuthInfo { did, signature: sig });
    }
    next.run(req).await
}

#[derive(Clone)]
pub struct AuthInfo {
    pub did: String,
    pub signature: Vec<u8>,
}
