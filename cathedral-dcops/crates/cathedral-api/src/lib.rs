pub mod auth;
pub mod extractors { pub mod authenticated_proposal; }
pub mod middleware { pub mod auth; }
pub mod routes { pub mod proposals; }
pub mod ws;
pub mod health;

use cathedral_wormgraph::WormGraphClient;

pub struct AppState {
    pub wormgraph: WormGraphClient,
    pub notifier: Notifier,
}

pub struct Notifier {
}

impl Notifier {
    pub async fn broadcast(&self, proposal: cathedral_wormgraph::ImprovementProposal) { }
    pub fn subscribe(&self) -> tokio::sync::broadcast::Receiver<String> {
        let (tx, rx) = tokio::sync::broadcast::channel(16);
        rx
    }
}

#[derive(Debug)]
pub enum ApiError {
    AuthFailed,
    MissingDid,
    MissingSignature,
    MissingId,
    NotFound,
    Forbidden,
    InvalidPayload,
}

impl axum::response::IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        axum::http::StatusCode::INTERNAL_SERVER_ERROR.into_response()
    }
}
