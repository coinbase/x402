use std::collections::HashMap;
use std::sync::Arc;
use serde_json::{json, Value};
use crate::errors::{X402Error, X402Result};
use crate::types::{Network, PaymentRequirements, Price};


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

pub struct ResourceInfo {
    url: String,
    description: String,
    mime_type: String,
}

pub trait SchemeNetworkServer: Send + Sync {
    /// The name of the scheme the server implements. (e.g.) "exact").
    fn scheme(&self) -> &str;

    /// Build PaymentRequirements for this particular (scheme, network) from a generic ResourceConfig
    fn build_requirements(
        &self,
        resource_config: &ResourceConfig
    ) -> X402Result<PaymentRequirements>;
}

pub struct SchemeServer {
    scheme: String,
    extra: Option<Value>,
    network: Network,
}

impl SchemeServer {
    pub fn new(
        scheme: Option<&str>,
        extra: Option<Value>,
        network: Network,
    ) -> SchemeServer {
        SchemeServer {
            scheme: scheme.unwrap_or("exact").to_string(),
            extra,
            network: network.into(),
        }
    }

    pub fn new_default() -> Arc<SchemeServer> {
        Arc::new(SchemeServer::default())
    }

    pub fn network(&self) -> Network {self.network.clone()}

    pub fn build_resource_config(
        &self,
        amount: &str,
        price: Price,
        timeout_in_seconds: Option<u64>,
    ) -> ResourceConfig {
        ResourceConfig::new(
            self.scheme(),
            amount,
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
            scheme: "exact".to_string(),
            extra: Some(json!({
            "name": "USDC",
            "version": "2"
        })),
            network: Network::default(),
        }
    }
}

impl SchemeNetworkServer for SchemeServer {
    fn scheme(&self) -> &str { &self.scheme }

    fn build_requirements(&self, resource_config: &ResourceConfig) -> X402Result<PaymentRequirements> {
        let (amount, asset) = resource_config.price.to_asset_amount();
        Ok(PaymentRequirements {
            scheme: self.scheme().to_owned(),
            network: resource_config.network.to_string(),
            pay_to: resource_config.pay_to.clone(),
            amount,
            asset,
            data: None,
            extra: self.extra.clone(),
        })
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

        fn build_requirements(&self, resource_config: &ResourceConfig) -> X402Result<PaymentRequirements> {

            let (amount, asset) = resource_config.price.to_asset_amount();

            Ok(PaymentRequirements {
                scheme: self.scheme().to_owned(),
                network: resource_config.network.to_string(),
                pay_to: resource_config.pay_to.clone(),
                amount,
                asset,
                data: None,
                extra: None
            })
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

        let reqs = server.build_payment_requirements(&config).unwrap();
        assert_eq!(reqs.len(), 1);

        let req = &reqs[0];
        assert_eq!(req.scheme, "test-scheme");
        assert_eq!(req.network, network.to_string());
        assert_eq!(req.amount, "1000");
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