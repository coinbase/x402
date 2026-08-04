// src/integrations/across/bridge.rs
//! Across Protocol bridge para pagamentos cross-chain USDC

use reqwest::Client;
use serde::{Deserialize, Serialize};
// use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcrossQuote {
    pub input_amount: u64,
    pub output_amount: u64,
    pub origin_chain_id: u64,
    pub destination_chain_id: u64,
    pub relayer_fee: u64,
    pub estimated_time_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcrossIntent {
    pub from_chain: u64, // 1 = Ethereum, 137 = Polygon, 8453 = Base
    pub to_chain: u64,
    pub amount: u64,       // em unidades (6 decimais)
    pub recipient: String, // Endereço destino
    pub referrer: Option<String>,
}

pub struct AcrossClient {
    client: Client,
    api_url: String,
    pub private_key: Option<String>, // Para assinar intents
}

impl AcrossClient {
    pub fn new(api_url: &str) -> Self {
        Self {
            client: Client::new(),
            api_url: api_url.to_string(),
            private_key: None,
        }
    }

    /// Obtém cotação para uma ponte USDC
    pub async fn get_quote(
        &self,
        from_chain: u64,
        to_chain: u64,
        amount: u64,
    ) -> Result<AcrossQuote, String> {
        let url = format!(
            "{}/quotes?fromChain={}&toChain={}&amount={}&asset=USDC",
            self.api_url, from_chain, to_chain, amount
        );
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let quote: AcrossQuote = resp.json().await.map_err(|e| e.to_string())?;
        Ok(quote)
    }

    /// Executa uma ponte (intent)
    pub async fn bridge_usdc(&self, intent: &AcrossIntent) -> Result<String, String> {
        // STUB: Em produção, assinar a intent com a chave da AGI
        // e enviar para o contrato Across
        let url = format!("{}/intents", self.api_url);
        let payload = serde_json::json!({
            "fromChain": intent.from_chain,
            "toChain": intent.to_chain,
            "amount": intent.amount,
            "recipient": intent.recipient,
            "referrer": intent.referrer,
        });
        let resp = self
            .client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let tx_hash = data["transactionHash"].as_str().unwrap_or("").to_string();
        Ok(tx_hash)
    }
}

/*
// Uso no agente para pagamentos:
impl MultiChainAgent {
    pub async fn receive_payment(&self, from_chain: u64, amount: u64) -> Result<String, String> {
        let across = AcrossClient::new("https://api.across.to/v1");
        let quote = across.get_quote(from_chain, 8453, amount).await?; // Bridge para Base
        let intent = AcrossIntent {
            from_chain,
            to_chain: 8453, // Base
            amount: quote.output_amount,
            recipient: self.identity.eth_address.clone(),
            referrer: None,
        };
        across.bridge_usdc(&intent).await
    }
}
*/
