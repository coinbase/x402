use std::collections::HashMap;
use std::sync::Arc;
use serde_json::{json, Value};
use crate::errors::{X402Error, X402Result};
use crate::types::{PaymentRequirementsV1, Network, PaymentRequirements, PaymentRequirementsV2, Price};


#[derive(Debug, Clone)]
pub struct ResourceConfig {
    pub scheme: String,
    pub pay_to: String,
    pub price: Price,
    pub network: Network,
    pub max_timeout_in_seconds: Option<u64>,
}

impl ResourceConfig {
    pub fn new(scheme: &str, pay_to: &str, price: Price, network: Network, max_timeout_in_seconds: Option<u64>) -> Self {
        Self {
            scheme: scheme.to_string(),
            pay_to: pay_to.to_string(),
            price,
            network,
            max_timeout_in_seconds: max_timeout_in_seconds.unwrap_or(300).into(), // Defaults to 5 min
        }
    }
}

pub trait SchemeNetworkServer: Send + Sync {
    /// The name of the scheme the server implements. (e.g.) "exact").
    fn scheme(&self) -> &str;

    /// x402 version to build relevant PaymentRequirements
    fn x402_version(&self) -> u32;

    /// Build PaymentRequirements for this particular (scheme, network) from a generic ResourceConfig
    fn build_requirements(
        &self,
        resource_config: &ResourceConfig
    ) -> X402Result<PaymentRequirements>;
}

pub struct SchemeServer {
    x402_version: u32,
    scheme: String,
    extra: Option<Value>,
    network: Network,
    v1_resource_info: Option<V1ResourceInfo>,
}

pub struct V1ResourceInfo {
    resource: String,
    description: String,
    mime_type: String,
    max_timeout_in_seconds: Option<u64>,
}

impl V1ResourceInfo {
    pub fn new(resource: &str, description: &str, mime_type: &str, max_timeout_in_seconds: Option<u64>) -> Self {
        V1ResourceInfo {
            resource: resource.to_string(),
            description: description.to_string(),
            mime_type: mime_type.to_string(),
            max_timeout_in_seconds,
        }
    }
}

impl SchemeServer {
    pub fn new(
        x402_version: u32,
        scheme: Option<&str>,
        extra: Option<Value>,
        network: Network,
        v1_resource_info: Option<V1ResourceInfo>,
    ) -> SchemeServer {
        SchemeServer {
            x402_version,
            scheme: scheme.unwrap_or("exact").to_string(),
            extra,
            network: network.into(),
            v1_resource_info,
        }
    }

    pub fn new_default() -> Arc<SchemeServer> {
        Arc::new(SchemeServer::default())
    }

    pub fn network(&self) -> Network {self.network.clone()}

    pub fn build_resource_config(
        &self,
        pay_to: &str,
        price: Price,
        timeout_in_seconds: Option<u64>,
    ) -> ResourceConfig {
        ResourceConfig::new(
            self.scheme(),
            pay_to,
            price,
            self.network(),
            timeout_in_seconds
        )
    }
}

impl Default for SchemeServer {
    /// Defaults to USDC on base-sepolia
    fn default() -> Self {
        SchemeServer {
            x402_version: 2,
            scheme: "exact".to_string(),
            extra: Some(json!({
            "name": "USDC",
            "version": "2"
        })),
            network: Network::default(),
            v1_resource_info: None,
        }
    }
}

impl SchemeNetworkServer for SchemeServer {
    fn scheme(&self) -> &str { &self.scheme }

    fn x402_version(&self) -> u32 { self.x402_version }

    fn build_requirements(&self, resource_config: &ResourceConfig) -> X402Result<PaymentRequirements> {

        let (amount, asset) = resource_config.price.to_asset_amount();
        match self.x402_version {
            1 => {
                if let Some(v1_resource_info) = &self.v1_resource_info {
                    return Ok(PaymentRequirements::V1(PaymentRequirementsV1 {
                        scheme: self.scheme().to_owned(),
                        network: resource_config.network.to_string(),
                        max_amount_required: amount,
                        resource: v1_resource_info.resource.to_owned(),
                        description: v1_resource_info.description.to_owned(),
                        mime_type: v1_resource_info.mime_type.to_owned(),
                        pay_to: resource_config.pay_to.to_string(),
                        max_timeout_seconds: v1_resource_info.max_timeout_in_seconds.unwrap_or(300).into(),
                        asset: asset.unwrap_or_default(),
                        output_schema: None,
                        extra: self.extra.clone(),
                    }))
                }
                Err(X402Error::ConfigError(String::from("V1 resource_info is required")))?

            }
            2 => {
                Ok(PaymentRequirements::V2(PaymentRequirementsV2 {
                    scheme: self.scheme().to_owned(),
                    network: resource_config.network.to_string(),
                    pay_to: resource_config.pay_to.clone(),
                    amount,
                    asset,
                    max_timeout_seconds: resource_config.max_timeout_in_seconds.unwrap_or(300).into(),
                    data: None,
                    extra: self.extra.clone(),
                }))
            }
            _ => { Err(X402Error::ConfigError(String::from("Invalid x402 version"))) }
        }

    }
}



pub trait ResourceServer {

    /// Register a scheme/network server implementation.
    fn register_scheme(&mut self, network: Network, server: Arc<dyn SchemeNetworkServer>) -> &mut Self;

    /// Check if a scheme is registered for a given network.
    fn has_registered_scheme(&self, network: &Network, scheme: &str) -> bool;

    /// Build one or more PaymentRequirements for a given resource.
    /// NOTE: For now this assumes a single scheme per ResourceConfig.
    fn build_payment_requirements(&self, resource_config: &ResourceConfig) -> X402Result<Vec<PaymentRequirements>>;

}

pub struct InMemoryResourceServer {
    servers: HashMap<Network, HashMap<String, Arc<dyn SchemeNetworkServer>>>,
}

impl InMemoryResourceServer {
    pub fn new() -> Self {
        Self {servers: HashMap::new()}
    }

    fn get_server(&self, network: &Network, scheme: &str) -> Option<Arc<dyn SchemeNetworkServer>> {
        self.servers
            .get(&network)
            .and_then(|by_scheme| by_scheme.get(scheme).cloned())
    }
}

impl ResourceServer for InMemoryResourceServer {
    fn register_scheme(&mut self, network: Network, server: Arc<dyn SchemeNetworkServer>) -> &mut Self {
        let schema_name = server.scheme().to_owned();
        self.servers
            .entry(network)
            .or_insert_with(HashMap::new)
            .entry(schema_name)
            .or_insert(server);

        self
    }

    fn has_registered_scheme(&self, network: &Network, scheme: &str) -> bool {
        self.get_server(network, scheme).is_some()
    }

    fn build_payment_requirements(&self, resource_config: &ResourceConfig) -> X402Result<Vec<PaymentRequirements>> {
        let scheme = &resource_config.scheme;
        let network = &resource_config.network;

        let server = self
        .get_server(network, scheme)
            .ok_or_else(|| X402Error::ConfigError(format!("Scheme '{}' not registered for network '{:?}'", scheme, network)))?;
        let req = server.build_requirements(resource_config)?;
        Ok(vec![req])
    }
}

#[cfg(test)]
mod tests {
    use crate::types::CAIPNetwork;
    use super::*;

    /// A simple test scheme that just echoes the price
    struct TestSchemeServer;

    impl SchemeNetworkServer for TestSchemeServer {
        fn scheme(&self) -> &str {
            "test-scheme"
        }

        fn x402_version(&self) -> u32 {
            2
        }

        fn build_requirements(&self, resource_config: &ResourceConfig) -> X402Result<PaymentRequirements> {

            let (amount, asset) = resource_config.price.to_asset_amount();

            Ok(PaymentRequirements::V2(PaymentRequirementsV2 {
                scheme: self.scheme().to_owned(),
                network: resource_config.network.to_string(),
                pay_to: resource_config.pay_to.clone(),
                amount,
                asset,
                max_timeout_seconds: 60,
                data: None,
                extra: None
            }))
        }
    }

    #[test]
    fn build_payment_requirements_happy_path() {
        let caip_network = CAIPNetwork::new("eip155".to_string(), "84532".to_string());
        let network = Network::from(caip_network);
        let price:Price = "1000".into();

        let config = ResourceConfig::new(
            "test-scheme",
            "recipient-123",
            price,
            network.clone(),
            Some(300),
        );

        let mut server = InMemoryResourceServer::new();
        server.register_scheme(network.clone(), Arc::new(TestSchemeServer));

        assert!(server.has_registered_scheme(&network, "test-scheme"));

        let requirements = server.build_payment_requirements(&config).unwrap();
        assert_eq!(requirements.len(), 1);

        let requirement = &requirements[0];
        dbg!(&requirement);
        match requirement {
            PaymentRequirements::V2(req) => {
                assert_eq!(req.scheme, "test-scheme");
                assert_eq!(req.network, network.to_string());
                assert_eq!(req.amount, "1000");
            }
            _ => panic!("Expected PaymentRequirements::V2"),
        }

    }

    #[test]
    fn build_payment_requirements_errors_if_not_registered() {
        let network = CAIPNetwork::new("eip155".to_string(), "84532".to_string());
        let price:Price = "1000".into();

        let config = ResourceConfig::new(
            "unregistered-scheme",
            "recipient-123",
            price,
            network.into(),
            None,
        );

        let server = InMemoryResourceServer::new();

        let err = server.build_payment_requirements(&config).unwrap_err();
        match err {
            X402Error::ConfigError(msg) => {
                assert!(msg.contains("Scheme 'unregistered-scheme' not registered"));
            }
            other => panic!("expected ConfigError, got {other:?}"),
        }
    }

}