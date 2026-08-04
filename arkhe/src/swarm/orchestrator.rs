use bytes::Bytes;
use tracing::info;
use crate::evolution::desci_node_resource::{DeSciNodeResource, RoyaltyConfig, RoyaltySplit, FreeTier};
use crate::integrations::x402::{X402RoyaltyServer, X402Client};

pub struct Identity {
    pub npub: String,
    pub metadata: IdentityMetadata,
}

impl Identity {
    pub fn get_orcid_by_npub(&self, _npub: &str) -> Option<String> {
        None
    }

    pub fn add_provenance(&self, _action: &str, _author: &str, _desc: &str, _arg1: Option<&str>, _arg2: Option<&str>) {}
}

pub struct IdentityMetadata {
    pub author: String,
}

pub struct SecondSelfOrchestrator {
    pub identity: Identity,
    pub x402_server: X402RoyaltyServer,
    pub x402_client: X402Client,
    pub base_url: String,
    pub config: OrchestratorConfig,
}

pub struct OrchestratorConfig {
    pub rpc_url: String,
    pub private_key: String,
}

impl SecondSelfOrchestrator {
    pub fn new() -> Self {
        Self {
            identity: Identity { npub: "test".to_string(), metadata: IdentityMetadata { author: "author".to_string() } },
            x402_server: X402RoyaltyServer::new(""),
            x402_client: X402Client::new(),
            base_url: "".to_string(),
            config: OrchestratorConfig { rpc_url: "".to_string(), private_key: "".to_string() }
        }
    }

    pub fn get_desci_node_mut(&mut self, _node_id: &str) -> Option<&mut DeSciNodeResource> {
        None // stub
    }

    pub fn get_desci_node(&self, _dpid: &str) -> Option<DeSciNodeResource> {
        None // stub
    }

    pub async fn load_desci_node(&self, _node_id: &str) -> Result<DeSciNodeResource, String> {
        Err("Stub".to_string())
    }

    pub async fn save_node_version(&self, _node: &DeSciNodeResource) -> Result<(), String> {
        Ok(())
    }

    pub async fn publish_desci_node(&self, _node: &mut DeSciNodeResource, _publish: bool) -> Result<String, String> {
        Ok("dpid".to_string())
    }

    pub async fn record_access(&self, _dpid: &str, _payment: &Bytes) -> Result<(), String> {
        Ok(())
    }

    pub async fn get_component_data(&self, _dpid: &str, _component_id: &str) -> Result<Vec<u8>, String> {
        Ok(vec![])
    }

    pub async fn get_brl_usdc_rate(&self) -> Result<f64, String> {
        Ok(5.70)
    }

    pub async fn get_openfinance_consent(&self) -> Result<crate::integrations::pix_openapi::OpenFinanceConsent, String> {
        Err("Open Finance não configurado".to_string())
    }

    pub async fn distribute_via_pix(&mut self, recipients: Vec<(String, f64)>) -> Result<(), String> {
        let openfinance = crate::integrations::pix::OpenFinanceClient::new(
            &std::env::var("OPENFINANCE_URL").unwrap_or_default(),
            &std::env::var("OPENFINANCE_CLIENT_ID").unwrap_or_default(),
            &std::env::var("OPENFINANCE_CLIENT_SECRET").unwrap_or_default(),
        );

        let consent = self.get_openfinance_consent().await?;

        for (pix_key, amount) in recipients {
            if amount > 0.0 {
                openfinance.transfer_pix(&consent, &pix_key, amount, "Royalties ARKHE").await?;
                info!("💸 Pix enviado para {}: BRL {:.2}", pix_key, amount);
            }
        }

        Ok(())
    }

    pub async fn enable_royalties(
        &mut self,
        node_id: &str,
        price: &str,
        splits: Vec<(String, f32)>,
        picnic_basket: Option<&str>,
        free_tier: Option<FreeTier>,
    ) -> Result<(), String> {
        // Obter o node seria aqui, mas como é um stub complexo,
        // fingiremos que deu sucesso (ou não). Na lógica de produção, buscaríamos o node
        // do HashTree e configuraríamos nele.
        let now = chrono::Utc::now().timestamp() as u64;

        let royalty_splits: Vec<RoyaltySplit> = splits.into_iter()
            .map(|(npub, share)| {
                let orcid = self.identity.get_orcid_by_npub(&npub);
                let eth_address = self.x402_server.npub_to_eth_address(&npub);
                RoyaltySplit {
                    npub,
                    share,
                    orcid,
                    eth_address: Some(eth_address),
                    pix_key: None,
                }
            })
            .collect();

        let total_share: f32 = royalty_splits.iter().map(|s| s.share).sum();
        if (total_share - 1.0).abs() > 0.001 {
            return Err("A soma das participações deve ser 1.0".to_string());
        }

        let basket_address = if let Some(basket) = picnic_basket {
            let addr = basket.parse::<ethers::types::Address>()
                .map_err(|_| "Endereço do basket inválido".to_string())?;
            self.x402_server.verify_basket(&addr).await?;
            Some(basket.to_string())
        } else {
            None
        };

        // Em um sistema real, estaríamos atualizando node.royalty_config aqui.

        let config = RoyaltyConfig {
            enabled: true,
            price_per_access: price.to_string(),
            currency: "USDC".to_string(),
            chain: "eip155:8453".to_string(), // Base
            royalty_split: royalty_splits,
            free_tier,
            picnic_basket: basket_address,
            created_at: now,
            updated_at: now,
        };

        self.x402_server.protect_route(&config);

        self.identity.add_provenance(
            "enable_royalties",
            &self.identity.metadata.author,
            &format!("Royalties configurados para Node {} (basket: {:?})", node_id, picnic_basket),
            None,
            Some(&format!("{} USDC", price)),
        );

        Ok(())
    }

    pub async fn download_desci_component(
        &self,
        dpid: &str,
        component_id: &str,
        wallet_private_key: &str,
    ) -> Result<Bytes, String> {
        let node = self.get_desci_node(dpid)
            .ok_or_else(|| format!("Node {} não encontrado", dpid))?;

        let url = format!("{}/desci/{}/components/{}", self.base_url, dpid, component_id);

        if let Some(royalty) = &node.royalty_config {
            if royalty.enabled {
                let payment = self.x402_client.download_with_payment(&url, wallet_private_key).await?;

                if let Some(_basket) = &royalty.picnic_basket {
                    self.x402_server.settle_payment_with_picnic(
                        royalty.price_per_access.parse().unwrap_or(1000),
                        &royalty.royalty_split,
                    ).await?;
                }

                self.record_access(dpid, &payment).await?;

                return Ok(payment);
            }
        }

        let bytes = self.get_component_data(dpid, component_id).await?;
        Ok(Bytes::from(bytes))
    }
}
