// src/integrations/bittensor/mod.rs
//! Integração com a rede Bittensor para inferência descentralizada de IA.
//! Suporte a múltiplas subnets com fallback e cache de axons.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use reqwest::Client;
use std::collections::HashMap;
use std::time::Duration;
use tracing::{info, warn, error, debug};
use tokio::sync::Mutex;
use std::sync::Arc;

pub mod sn96_verathos;
pub mod sn64_chutes;
pub mod sn60_bitsec;
pub mod sn61_redteam;
pub mod sn1_apex;
pub mod sn62_ridges;
pub mod sn31_recall;
pub mod sn4_targon;

// ─── Tipos Comuns ──────────────────────────────────────────────────────────

/// Configuração do cliente Bittensor
#[derive(Debug, Clone)]
pub struct BittensorConfig {
    pub network: BittensorNetwork,
    pub wallet_path: String,
    pub hotkey: String,
    pub timeout_seconds: u64,
    pub max_retries: u32,
}

impl Default for BittensorConfig {
    fn default() -> Self {
        Self {
            network: BittensorNetwork::Mainnet,
            wallet_path: "~/.bittensor/wallets/".to_string(),
            hotkey: "default".to_string(),
            timeout_seconds: 30,
            max_retries: 3,
        }
    }
}

#[derive(Debug, Clone)]
pub enum BittensorNetwork {
    Mainnet,
    Testnet,
    Localnet,
}

impl BittensorNetwork {
    pub fn as_str(&self) -> &'static str {
        match self {
            BittensorNetwork::Mainnet => "mainnet",
            BittensorNetwork::Testnet => "testnet",
            BittensorNetwork::Localnet => "localnet",
        }
    }
}

/// Resposta genérica de uma subnet
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubnetResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub miner_uid: u32,
    pub validator_score: f32,
    pub processing_time_ms: u64,
    pub error: Option<String>,
}

/// Axon (endpoint de um miner)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Axon {
    pub ip: String,
    pub port: u16,
    pub protocol: String, // "http" ou "https"
    pub uid: u32,
    pub hotkey: String,
    pub coldkey: String,
}

impl Axon {
    pub fn url(&self) -> String {
        format!("{}://{}:{}", self.protocol, self.ip, self.port)
    }
}

// ─── Cliente Base ──────────────────────────────────────────────────────────

pub struct BittensorClient {
    config: BittensorConfig,
    client: Client,
    // Cache de axons por subnet
    axons_cache: Arc<Mutex<HashMap<u16, Vec<Axon>>>>,
}

impl BittensorClient {
    pub fn new(config: BittensorConfig) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()?;

        Ok(Self {
            config,
            client,
            axons_cache: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// Obtém os top-k axons de uma subnet
    pub async fn get_top_axons(&self, subnet_id: u16, top_k: usize) -> Result<Vec<Axon>> {
        let mut cache = self.axons_cache.lock().await;

        // Verifica cache
        if let Some(axons) = cache.get(&subnet_id) {
            let mut sorted = axons.clone();
            // Em produção: ordenar por score do validador
            sorted.truncate(top_k);
            return Ok(sorted);
        }

        // Busca da Metagraph via Subtensor
        let axons = self.fetch_axons_from_metagraph(subnet_id).await?;
        cache.insert(subnet_id, axons.clone());

        let mut sorted = axons;
        sorted.truncate(top_k);
        Ok(sorted)
    }

    /// Busca axons da Metagraph (usando bittensor-rs ou RPC)
    async fn fetch_axons_from_metagraph(&self, subnet_id: u16) -> Result<Vec<Axon>> {
        // Em produção: usar bittensor-rs para consultar a cadeia
        // https://github.com/womboai/rusttensor

        // Stub para POC - em produção, consultar o Subtensor
        let mock_axons = vec![
            Axon {
                ip: format!("127.0.0.{}", 1),
                port: 8091 + subnet_id,
                protocol: "http".to_string(),
                uid: 0,
                hotkey: "mock_hotkey_1".to_string(),
                coldkey: "mock_coldkey_1".to_string(),
            },
            Axon {
                ip: format!("127.0.0.{}", 2),
                port: 8091 + subnet_id,
                protocol: "http".to_string(),
                uid: 1,
                hotkey: "mock_hotkey_2".to_string(),
                coldkey: "mock_coldkey_2".to_string(),
            },
            Axon {
                ip: format!("127.0.0.{}", 3),
                port: 8091 + subnet_id,
                protocol: "http".to_string(),
                uid: 2,
                hotkey: "mock_hotkey_3".to_string(),
                coldkey: "mock_coldkey_3".to_string(),
            },
        ];

        Ok(mock_axons)
    }

    /// Consulta um axon específico
    pub async fn query_axon<T: Serialize, R: for<'de> Deserialize<'de>>(
        &self,
        axon: &Axon,
        endpoint: &str,
        payload: &T,
    ) -> Result<SubnetResponse<R>> {
        let url = format!("{}/{}", axon.url(), endpoint);

        debug!("Consultando axon {}: {}", axon.uid, url);

        let start = std::time::Instant::now();
        let response = self.client
            .post(&url)
            .json(payload)
            .send()
            .await?;

        let processing_time_ms = start.elapsed().as_millis() as u64;

        if response.status().is_success() {
            let data: R = response.json().await?;
            Ok(SubnetResponse {
                success: true,
                data: Some(data),
                miner_uid: axon.uid,
                validator_score: 0.9, // Em produção: obter da metagraph
                processing_time_ms,
                error: None,
            })
        } else {
            let error_text = response.text().await?;
            Ok(SubnetResponse {
                success: false,
                data: None,
                miner_uid: axon.uid,
                validator_score: 0.0,
                processing_time_ms,
                error: Some(error_text),
            })
        }
    }

    /// Consulta uma subnet com fallback entre múltiplos axons
    pub async fn query_subnet_with_fallback<T: Serialize + Clone, R: for<'de> Deserialize<'de>>(
        &self,
        subnet_id: u16,
        endpoint: &str,
        payload: &T,
        top_k: usize,
        min_success: usize,
    ) -> Result<Vec<SubnetResponse<R>>> {
        let axons = self.get_top_axons(subnet_id, top_k).await?;

        let mut tasks = Vec::new();
        for axon in axons {
            let client = self.client.clone();
            let payload = payload.clone();
            let endpoint = endpoint.to_string();

            tasks.push(tokio::spawn(async move {
                // Criar um cliente temporário para esta consulta
                let temp_client = BittensorClient {
                    config: BittensorConfig::default(),
                    client,
                    axons_cache: Arc::new(Mutex::new(HashMap::new())),
                };
                temp_client.query_axon::<T, R>(&axon, &endpoint, &payload).await
            }));
        }

        let mut results = Vec::new();
        for task in tasks {
            if let Ok(Ok(response)) = task.await {
                if response.success {
                    results.push(response);
                }
            }
        }

        if results.len() < min_success {
            return Err(anyhow!(
                "Apenas {} de {} miners responderam com sucesso",
                results.len(),
                min_success
            ));
        }

        // Ordena por score (decrescente)
        results.sort_by(|a, b| b.validator_score.partial_cmp(&a.validator_score).unwrap());
        Ok(results)
    }
}
