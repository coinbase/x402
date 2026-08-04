// src/integrations/bittensor/sn31_recall.rs
//! Integração com a SN31 (Recall) para RAG descentralizada.

use super::*;
use serde::{Deserialize, Serialize};

// ─── Tipos ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct RecallQueryRequest {
    pub query: String,
    pub top_k: Option<usize>,
    pub filter: Option<serde_json::Value>,
    pub include_metadata: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RecallDocument {
    pub id: String,
    pub content: String,
    pub metadata: serde_json::Value,
    pub score: f32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RecallQueryResponse {
    pub documents: Vec<RecallDocument>,
    pub total: usize,
    pub processing_time_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecallStoreRequest {
    pub id: String,
    pub content: String,
    pub metadata: serde_json::Value,
    pub embedding: Option<Vec<f32>>, // Se não fornecido, a subnet gera
}

#[derive(Debug, Clone, Deserialize)]
pub struct RecallStoreResponse {
    pub id: String,
    pub success: bool,
}

// ─── Cliente SN31 ──────────────────────────────────────────────────────────

pub struct RecallClient {
    bittensor: Arc<BittensorClient>,
    subnet_id: u16,
}

impl RecallClient {
    pub fn new(bittensor: Arc<BittensorClient>) -> Self {
        Self {
            bittensor,
            subnet_id: 31,
        }
    }

    /// Busca documentos relevantes
    pub async fn query(
        &self,
        query: &str,
        top_k: usize,
    ) -> Result<Vec<RecallDocument>> {
        let request = RecallQueryRequest {
            query: query.to_string(),
            top_k: Some(top_k),
            filter: None,
            include_metadata: Some(true),
        };

        let responses = self.bittensor
            .query_subnet_with_fallback::<_, RecallQueryResponse>(
                self.subnet_id,
                "query",
                &request,
                3,
                1,
            )
            .await?;

        let best = &responses[0];
        let response = best.data.clone().ok_or_else(|| anyhow!("Resposta vazia da SN31"))?;
        Ok(response.documents)
    }

    /// Armazena um documento na SN31
    pub async fn store(
        &self,
        id: &str,
        content: &str,
        metadata: serde_json::Value,
    ) -> Result<String> {
        let request = RecallStoreRequest {
            id: id.to_string(),
            content: content.to_string(),
            metadata,
            embedding: None,
        };

        let responses = self.bittensor
            .query_subnet_with_fallback::<_, RecallStoreResponse>(
                self.subnet_id,
                "store",
                &request,
                2,
                1,
            )
            .await?;

        let best = &responses[0];
        let response = best.data.clone().ok_or_else(|| anyhow!("Resposta vazia da SN31"))?;
        Ok(response.id)
    }
    /*
    /// Busca vulnerabilidades relacionadas (integrado com WormGraph)
    pub async fn find_related_vulnerabilities(
        &self,
        vulnerability: &crate::integrations::openant::Vulnerability,
    ) -> Result<Vec<crate::integrations::openant::Vulnerability>> {
        let query = format!(
            "{} - {}",
            vulnerability.title,
            vulnerability.description
        );

        let docs = self.query(&query, 5).await?;

        // Converte documentos para vulnerabilidades (assumindo que estão no formato certo)
        let mut vulns = Vec::new();
        for doc in docs {
            if let Ok(v) = serde_json::from_value::<crate::integrations::openant::Vulnerability>(doc.metadata) {
                vulns.push(v);
            }
        }

        Ok(vulns)
    }
    */
}

// ─── Integração com o WormGraph ──────────────────────────────────────────
/*
impl crate::wormgraph_arweave::WormGraphIndexer {
    /// Indexa no WormGraph e também armazena na SN31
    pub async fn index_with_recall(
        &mut self,
        vuln: &crate::integrations::openant::Vulnerability,
        source: &str,
    ) -> Result<String> {
        // 1. Indexa no WormGraph (existente)
        let tx_id = self.index_vulnerability(vuln, source)?;

        // 2. Armazena na SN31
        let bittensor = crate::integrations::bittensor::BittensorClient::new(
            crate::integrations::bittensor::BittensorConfig::default()
        )?;
        let recall = RecallClient::new(Arc::new(bittensor));

        let metadata = serde_json::to_value(vuln)?;
        let recall_id = recall.store(
            &vuln.id,
            &format!("{} - {}", vuln.title, vuln.description),
            metadata,
        ).await?;

        info!("📚 Vulnerabilidade armazenada na SN31: {}", recall_id);
        Ok(tx_id)
    }
}
*/
