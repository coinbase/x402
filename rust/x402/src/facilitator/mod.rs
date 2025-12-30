mod facilitator;
mod http;

pub use facilitator::FacilitatorClient;
pub use http::HttpFacilitator;


// Optional helper for a default HTTP facilitator wrapped in Arc<dyn FacilitatorClient>

use std::sync::Arc;

pub fn default_http_facilitator(base_url: &str) -> Arc<dyn FacilitatorClient> {
    Arc::new(HttpFacilitator::new(base_url))
}