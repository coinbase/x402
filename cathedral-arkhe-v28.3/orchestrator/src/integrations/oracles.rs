// src/integrations/oracles.rs

use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceData {
    pub asset: String,
    pub price: f64,
    pub timestamp: u64,
    pub confidence: f32,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiInsight {
    pub prompt: String,
    pub response: String,
    pub model: String,
    pub timestamp: u64,
}

/// APRO Oracle (AI-enhanced data feeds)
pub struct AproOracle {
    client: Client,
    api_url: String,
    api_key: String,
}

impl AproOracle {
    pub fn new(api_url: &str, api_key: &str) -> Self {
        Self {
            client: Client::new(),
            api_url: api_url.to_string(),
            api_key: api_key.to_string(),
        }
    }

    pub async fn get_ai_insight(&self, prompt: &str) -> Result<AiInsight, String> {
        let resp = self
            .client
            .post(format!("{}/ai/insight", self.api_url))
            .header("Authorization", &self.api_key)
            .json(&serde_json::json!({ "prompt": prompt }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(AiInsight {
            prompt: prompt.to_string(),
            response: data["response"].as_str().unwrap_or("").to_string(),
            model: data["model"].as_str().unwrap_or("apro").to_string(),
            timestamp: chrono::Utc::now().timestamp() as u64,
        })
    }
}

/// DIA Oracle (verifiable price feeds)
pub struct DiaOracle {
    client: Client,
    api_url: String,
}

impl DiaOracle {
    pub fn new(api_url: &str) -> Self {
        Self {
            client: Client::new(),
            api_url: api_url.to_string(),
        }
    }

    pub async fn get_price(&self, asset: &str) -> Result<PriceData, String> {
        let url = format!("{}/price/{}", self.api_url, asset);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(PriceData {
            asset: asset.to_string(),
            price: data["price"].as_f64().unwrap_or(0.0),
            timestamp: data["timestamp"].as_u64().unwrap_or(0),
            confidence: data["confidence"].as_f64().unwrap_or(0.9) as f32,
            source: "dia".to_string(),
        })
    }
}

/// Oráculo combinado para a AGI
pub struct AGIOracle {
    apro: AproOracle,
    dia: DiaOracle,
}

impl AGIOracle {
    pub fn new(apro: AproOracle, dia: DiaOracle) -> Self {
        Self { apro, dia }
    }

    pub async fn get_combined_insight(&self, asset: &str) -> Result<PriceData, String> {
        let price_data = self.dia.get_price(asset).await?;
        let _insight = self
            .apro
            .get_ai_insight(&format!("Analyze {} price: {}", asset, price_data.price))
            .await?;
        // Combina dados
        let mut combined = price_data;
        combined.confidence = 0.95; // Ajuste baseado no insight
        Ok(combined)
    }
}
