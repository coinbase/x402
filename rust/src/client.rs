//! HTTP client with x402 payment support

use crate::types::*;
use crate::{Result, X402Error};
use reqwest::{Client, Response};
use serde_json::Value;
use axum::http;
use std::time::Duration;

/// HTTP client with x402 payment support
#[derive(Debug, Clone)]
pub struct X402Client {
    /// Underlying HTTP client
    client: Client,
    /// Default facilitator configuration
    facilitator_config: FacilitatorConfig,
}

impl X402Client {
    /// Create a new x402 client
    pub fn new() -> Self {
        Self::with_config(FacilitatorConfig::default())
    }

    /// Create a new x402 client with custom configuration
    pub fn with_config(facilitator_config: FacilitatorConfig) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            facilitator_config,
        }
    }

    /// Create a GET request
    pub fn get(&self, url: &str) -> X402RequestBuilder {
        X402RequestBuilder::new(self, self.client.get(url))
    }

    /// Create a POST request
    pub fn post(&self, url: &str) -> X402RequestBuilder {
        X402RequestBuilder::new(self, self.client.post(url))
    }

    /// Create a PUT request
    pub fn put(&self, url: &str) -> X402RequestBuilder {
        X402RequestBuilder::new(self, self.client.put(url))
    }

    /// Create a DELETE request
    pub fn delete(&self, url: &str) -> X402RequestBuilder {
        X402RequestBuilder::new(self, self.client.delete(url))
    }

    /// Handle a 402 payment required response
    pub async fn handle_payment_required(
        &self,
        response: Response,
        payment_payload: &PaymentPayload,
    ) -> Result<Response> {
        if response.status() != 402 {
            return Ok(response);
        }

        let original_url = response.url().to_string();
        let payment_requirements: PaymentRequirementsResponse = response.json().await?;
        
        // Verify the payment with the facilitator
        let facilitator = super::facilitator::FacilitatorClient::new(self.facilitator_config.clone());
        
        for requirements in &payment_requirements.accepts {
            let verify_response = facilitator.verify(payment_payload, requirements).await?;
            
            if verify_response.is_valid {
                // Retry the original request with payment
                let mut request = self.client.get(&original_url);

                // Note: In reqwest 0.12+, we can't access original request details
                // This is a simplified retry - in production you'd need to store request details

                // Add payment header
                let payment_header = payment_payload.to_base64()?;
                request = request.header("X-PAYMENT", payment_header);

                let new_response = request.send().await?;
                return Ok(new_response);
            }
        }

        Err(X402Error::payment_verification_failed(
            "Payment verification failed for all requirements",
        ))
    }

    /// Get the facilitator configuration
    pub fn facilitator_config(&self) -> &FacilitatorConfig {
        &self.facilitator_config
    }

    /// Set a new facilitator configuration
    pub fn with_facilitator_config(mut self, config: FacilitatorConfig) -> Self {
        self.facilitator_config = config;
        self
    }
}

impl Default for X402Client {
    fn default() -> Self {
        Self::new()
    }
}

/// Request builder for x402 client
#[derive(Debug)]
pub struct X402RequestBuilder<'a> {
    client: &'a X402Client,
    request: reqwest::RequestBuilder,
}

impl<'a> X402RequestBuilder<'a> {
    fn new(client: &'a X402Client, request: reqwest::RequestBuilder) -> Self {
        Self { client, request }
    }

    /// Add a header to the request
    pub fn header<K, V>(self, key: K, value: V) -> Self
    where
        reqwest::header::HeaderName: std::convert::TryFrom<K>,
        <reqwest::header::HeaderName as std::convert::TryFrom<K>>::Error: Into<http::Error>,
        reqwest::header::HeaderValue: std::convert::TryFrom<V>,
        <reqwest::header::HeaderValue as std::convert::TryFrom<V>>::Error: Into<http::Error>,
    {
        Self {
            request: self.request.header(key, value),
            ..self
        }
    }

    /// Add multiple headers to the request
    pub fn headers(self, headers: reqwest::header::HeaderMap) -> Self {
        Self {
            request: self.request.headers(headers),
            ..self
        }
    }

    /// Set the request body
    pub fn body(self, body: impl Into<reqwest::Body>) -> Self {
        Self {
            request: self.request.body(body),
            ..self
        }
    }

    /// Set JSON body
    pub fn json<T: serde::Serialize>(self, json: &T) -> Self {
        Self {
            request: self.request.json(json),
            ..self
        }
    }

    /// Set form data
    pub fn form<T: serde::Serialize>(self, form: &T) -> Self {
        Self {
            request: self.request.form(form),
            ..self
        }
    }

    /// Set query parameters
    pub fn query<T: serde::Serialize>(self, query: &T) -> Self {
        Self {
            request: self.request.query(query),
            ..self
        }
    }

    /// Set timeout for the request
    pub fn timeout(self, timeout: Duration) -> Self {
        Self {
            request: self.request.timeout(timeout),
            ..self
        }
    }

    /// Add a payment header to the request
    pub fn payment(self, payment_payload: &PaymentPayload) -> Result<Self> {
        let payment_header = payment_payload.to_base64()?;
        Ok(self.header("X-PAYMENT", &payment_header))
    }

    /// Send the request
    pub async fn send(self) -> Result<Response> {
        self.request
            .send()
            .await
            .map_err(X402Error::from)
    }

    /// Send the request and handle x402 payments automatically
    pub async fn send_with_payment(self, payment_payload: &PaymentPayload) -> Result<Response> {
        let response = self.send().await?;
        
        if response.status() == 402 {
            // We need to handle this differently since we can't access the client after consuming self
            Err(X402Error::payment_verification_failed("Payment required but retry not implemented"))
        } else {
            Ok(response)
        }
    }

    /// Send the request and return the response as text
    pub async fn send_and_get_text(self) -> Result<String> {
        let response = self.send().await?;
        response.text().await.map_err(X402Error::from)
    }

    /// Send the request and return the response as JSON
    pub async fn send_and_get_json<T>(self) -> Result<T>
    where
        T: serde::de::DeserializeOwned,
    {
        let response = self.send().await?;
        response.json().await.map_err(X402Error::from)
    }
}

/// Discovery client for finding x402 resources
#[derive(Debug, Clone)]
pub struct DiscoveryClient {
    /// Base URL of the discovery service
    url: String,
    /// HTTP client
    client: Client,
}

impl DiscoveryClient {
    /// Create a new discovery client
    pub fn new(url: impl Into<String>) -> Self {
        let client = Client::new();
        Self {
            url: url.into(),
            client,
        }
    }

    /// Get the default discovery client
    pub fn default() -> Self {
        Self::new("https://x402.org/discovery")
    }

    /// Discover resources with optional filters
    pub async fn discover_resources(
        &self,
        filters: Option<DiscoveryFilters>,
    ) -> Result<DiscoveryResponse> {
        let mut request = self.client.get(&format!("{}/resources", self.url));

        if let Some(filters) = filters {
            if let Some(resource_type) = filters.resource_type {
                request = request.query(&[("type", resource_type)]);
            }
            if let Some(limit) = filters.limit {
                request = request.query(&[("limit", limit.to_string())]);
            }
            if let Some(offset) = filters.offset {
                request = request.query(&[("offset", offset.to_string())]);
            }
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(X402Error::facilitator_error(format!(
                "Discovery failed with status: {}",
                response.status()
            )));
        }

        let discovery_response: DiscoveryResponse = response.json().await?;
        Ok(discovery_response)
    }

    /// Get all available resources
    pub async fn get_all_resources(&self) -> Result<DiscoveryResponse> {
        self.discover_resources(None).await
    }

    /// Get resources by type
    pub async fn get_resources_by_type(&self, resource_type: &str) -> Result<DiscoveryResponse> {
        self.discover_resources(Some(DiscoveryFilters {
            resource_type: Some(resource_type.to_string()),
            limit: None,
            offset: None,
        }))
        .await
    }

    /// Get the base URL of this discovery service
    pub fn url(&self) -> &str {
        &self.url
    }
}

/// Filters for discovery requests
#[derive(Debug, Clone)]
pub struct DiscoveryFilters {
    /// Filter by resource type
    pub resource_type: Option<String>,
    /// Maximum number of results
    pub limit: Option<u32>,
    /// Number of results to skip
    pub offset: Option<u32>,
}

impl DiscoveryFilters {
    /// Create new discovery filters
    pub fn new() -> Self {
        Self {
            resource_type: None,
            limit: None,
            offset: None,
        }
    }

    /// Set resource type filter
    pub fn with_resource_type(mut self, resource_type: impl Into<String>) -> Self {
        self.resource_type = Some(resource_type.into());
        self
    }

    /// Set limit
    pub fn with_limit(mut self, limit: u32) -> Self {
        self.limit = Some(limit);
        self
    }

    /// Set offset
    pub fn with_offset(mut self, offset: u32) -> Self {
        self.offset = Some(offset);
        self
    }
}

impl Default for DiscoveryFilters {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = X402Client::new();
        assert_eq!(client.facilitator_config().url, "https://x402.org/facilitator");
    }

    #[test]
    fn test_client_with_config() {
        let config = FacilitatorConfig::new("https://custom-facilitator.com");
        let client = X402Client::with_config(config);
        assert_eq!(client.facilitator_config().url, "https://custom-facilitator.com");
    }

    #[test]
    fn test_discovery_filters() {
        let filters = DiscoveryFilters::new()
            .with_resource_type("http")
            .with_limit(10)
            .with_offset(0);

        assert_eq!(filters.resource_type, Some("http".to_string()));
        assert_eq!(filters.limit, Some(10));
        assert_eq!(filters.offset, Some(0));
    }

    #[test]
    fn test_discovery_client_creation() {
        let client = DiscoveryClient::new("https://example.com/discovery");
        assert_eq!(client.url(), "https://example.com/discovery");
    }
}
