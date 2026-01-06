use http::HeaderMap;
use serde::de::DeserializeOwned;
use serde::Serialize;
use crate::errors::{X402Error, X402Result};
use crate::facilitator::FacilitatorClient;
use crate::types::{PaymentPayload, PaymentRequirements, SettleResponse, VerifyRequest, VerifyResponse};

pub struct HttpFacilitator {
    pub base_url: String,
    verify_path: String,
    settle_path: String,
    client: reqwest::Client,
    headers: HeaderMap,
}

/// Builder for HttpFacilitator
pub struct HttpFacilitatorBuilder {
    base_url: String,
    verify_path: Option<String>,
    settle_path: Option<String>,
    headers: HeaderMap,
    client: Option<reqwest::Client>,
}

impl HttpFacilitatorBuilder {
    /// Override the verify endpoint path (e.g. "/v1/x402/verify").
    pub fn with_verify_path(mut self, path: impl Into<String>) -> Self {
        self.verify_path = Some(path.into());
        self
    }

    /// Override the settle endpoint path (e.g. "/v1/x402/settle").
    pub fn with_settle_path(mut self, path: impl Into<String>) -> Self {
        self.settle_path = Some(path.into());
        self
    }

    /// Set headers used for all requests (e.g. auth).
    pub fn with_headers(mut self, headers: HeaderMap) -> Self {
        self.headers = headers;
        self
    }

    /// Override the underlying reqwest client (optional).
    pub fn with_client(mut self, client: reqwest::Client) -> Self {
        self.client = Some(client);
        self
    }

    pub fn build(self) -> HttpFacilitator {
        HttpFacilitator {
            base_url: self.base_url,
            verify_path: self.verify_path.unwrap_or_else(|| "/verify".to_string()),
            settle_path: self.settle_path.unwrap_or_else(|| "/settle".to_string()),
            client: self.client.unwrap_or_else(reqwest::Client::new),
            headers: self.headers,
        }
    }
}

impl HttpFacilitator {

    pub fn builder(base_url: impl Into<String>) -> HttpFacilitatorBuilder {
        HttpFacilitatorBuilder {
            base_url: base_url.into(),
            verify_path: Some("/verify".to_string()),
            settle_path: Some("/settle".to_string()),
            headers: HeaderMap::new(),
            client: None,
        }
    }

    fn join_url(base: &str, path: &str) -> String {
        let base = base.trim_end_matches('/');
        let path = path.trim_start_matches('/');
        format!("{}/{}", base, path)
    }

    pub fn new(base_url: &str) -> Self {
        Self::builder(base_url).build()
    }

    fn verify_url(&self) -> String {
        Self::join_url(&self.base_url, &self.verify_path)
    }

    fn settle_url(&self) -> String {
        Self::join_url(&self.base_url, &self.settle_path)
    }

    /// Generalized post-method to reuse common route logic across 'verify' and 'settle'
    async fn post_json<Req, Res>(&self, url: String, req: &Req) -> X402Result<Res>
    where
        Req: Serialize + ?Sized,
        Res: DeserializeOwned,
    {
        let response = self.client
            .post(url)
            .headers(self.headers.clone())
            .json(req)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let err_text = response.text().await.unwrap_or_else(|e| format!("Unknown Error: {}", e));
            return Err(X402Error::FacilitatorRejection(status.as_u16(), err_text));
        }

        Ok(response.json::<Res>().await?)
    }
}

#[async_trait::async_trait]
impl FacilitatorClient for HttpFacilitator {

    async fn verify(
        &self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> X402Result<VerifyResponse> {
        let request = VerifyRequest {
            payment_payload: payload,
            payment_requirements: requirements,
        };
        self.post_json(self.verify_url(), &request).await
    }

    async fn settle(
        &self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> X402Result<SettleResponse> {
        let request = VerifyRequest {
            payment_payload: payload,
            payment_requirements: requirements,
        };
        self.post_json(self.settle_url(), &request).await
    }
}
