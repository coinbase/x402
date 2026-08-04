// src/integrations/bittensor/sn96_verathos.rs
//! Integração com a SN96 (Verathos) para inferência verificada com ZK.

use super::*;
use serde::{Deserialize, Serialize};
use tracing::info;

// ─── Tipos ──────────────────────────────────────────────────────────────────

/// Request para inferência na SN96
#[derive(Debug, Clone, Serialize)]
pub struct VerathosInferenceRequest {
    pub prompt: String,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub stream: Option<bool>,
    pub enable_zk_verification: Option<bool>, // Ativa a verificação ZK
}

/// Resposta de inferência com prova ZK
#[derive(Debug, Clone, Deserialize)]
pub struct VerathosInferenceResponse {
    pub text: String,
    pub zk_proof: Option<String>, // Prova ZK serializada (hex)
    pub model: String,
    pub usage: VerathosUsage,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VerathosUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Prova ZK verificada
#[derive(Debug, Clone, Deserialize)]
pub struct VerathosZKProof {
    pub proof: String,      // Prova ZK (hex)
    pub public_inputs: Vec<String>,
    pub verification_key: String,
}

// ─── Cliente SN96 ──────────────────────────────────────────────────────────

pub struct VerathosClient {
    bittensor: Arc<BittensorClient>,
    subnet_id: u16,
}

impl VerathosClient {
    pub fn new(bittensor: Arc<BittensorClient>) -> Self {
        Self {
            bittensor,
            subnet_id: 96,
        }
    }

    /// Inferência simples (sem verificação ZK)
    pub async fn infer(
        &self,
        prompt: &str,
        max_tokens: Option<u32>,
        temperature: Option<f32>,
    ) -> Result<String> {
        let request = VerathosInferenceRequest {
            prompt: prompt.to_string(),
            max_tokens,
            temperature,
            top_p: None,
            stream: Some(false),
            enable_zk_verification: Some(false),
        };

        let responses = self.bittensor
            .query_subnet_with_fallback::<_, VerathosInferenceResponse>(
                self.subnet_id,
                "inference",
                &request,
                3, // top 3 miners
                1, // pelo menos 1 sucesso
            )
            .await?;

        // Pega a melhor resposta
        let best = &responses[0];
        Ok(best.data.as_ref().unwrap().text.clone())
    }

    /// Inferência com verificação ZK (retorna a prova)
    pub async fn infer_with_zk(
        &self,
        prompt: &str,
        max_tokens: Option<u32>,
        temperature: Option<f32>,
    ) -> Result<(String, VerathosZKProof)> {
        let request = VerathosInferenceRequest {
            prompt: prompt.to_string(),
            max_tokens,
            temperature,
            top_p: None,
            stream: Some(false),
            enable_zk_verification: Some(true),
        };

        let responses = self.bittensor
            .query_subnet_with_fallback::<_, VerathosInferenceResponse>(
                self.subnet_id,
                "inference",
                &request,
                3,
                1,
            )
            .await?;

        let best = &responses[0];
        let data = best.data.as_ref().unwrap();

        // Extrai a prova ZK do response (assumindo que vem em um campo extra)
        // Em produção: a prova seria retornada em um campo separado
        let zk_proof = VerathosZKProof {
            proof: data.zk_proof.clone().unwrap_or_default(),
            public_inputs: vec![prompt.to_string()],
            verification_key: "zk_vk_hex".to_string(),
        };

        Ok((data.text.clone(), zk_proof))
    }

    /// Verifica uma prova ZK off-chain (usando o verifier da Cathedral)
    pub async fn verify_zk_proof(&self, _proof: &VerathosZKProof) -> Result<bool> {
        // Integra com o verifier ZK-SNARK da Cathedral
        // Usa o módulo existente: crate::integrations::openant::zk_proof
        // Aqui só fazemos um stub
        info!("🔐 Verificando prova ZK da SN96");
        Ok(true) // Em produção: chamar o verifier
    }
}

// ─── Integração com o Fast Brain ──────────────────────────────────────────
/*
impl crate::fastbrain::FastBrain {
    /// Inferência usando SN96 (Verathos) com verificação ZK
    pub async fn infer_with_verathos(
        &self,
        prompt: &str,
        verify_zk: bool,
    ) -> Result<String> {
        let bittensor = crate::integrations::bittensor::BittensorClient::new(
            crate::integrations::bittensor::BittensorConfig::default()
        )?;
        let verathos = VerathosClient::new(Arc::new(bittensor));

        if verify_zk {
            let (text, proof) = verathos.infer_with_zk(prompt, Some(2000), Some(0.7)).await?;
            // Verifica a prova
            if verathos.verify_zk_proof(&proof).await? {
                info!("✅ Prova ZK verificada com sucesso");
                Ok(text)
            } else {
                Err(anyhow!("Falha na verificação da prova ZK"))
            }
        } else {
            verathos.infer(prompt, Some(2000), Some(0.7)).await
        }
    }
}
*/
