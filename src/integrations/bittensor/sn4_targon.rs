// src/integrations/bittensor/sn4_targon.rs
//! Integração com a SN4 (Targon) para geração de provas ZK em TEE.

use super::*;
use serde::{Deserialize, Serialize};

// ─── Tipos ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct TargonZKRequest {
    pub circuit_wasm: String,            // Circuito WASM (base64)
    pub proving_key: String,             // Proving key (base64)
    pub public_inputs: Vec<String>,      // Inputs públicos (hex)
    pub private_inputs: Vec<String>,     // Inputs privados (hex)
    pub tee_type: Option<String>,        // "sgx", "sev", "nitro"
    pub require_attestation: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TargonZKResponse {
    pub proof: String,                   // Prova ZK (hex)
    pub attestation: Option<String>,     // Atestação TEE (hex)
    pub performance: TargonPerformance,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TargonPerformance {
    pub setup_time_ms: u64,
    pub proving_time_ms: u64,
    pub verification_time_ms: u64,
    pub memory_usage_mb: u32,
}

// ─── Cliente SN4 ──────────────────────────────────────────────────────────

pub struct TargonClient {
    bittensor: Arc<BittensorClient>,
    subnet_id: u16,
}

impl TargonClient {
    pub fn new(bittensor: Arc<BittensorClient>) -> Self {
        Self {
            bittensor,
            subnet_id: 4,
        }
    }

    /// Gera uma prova ZK em TEE
    pub async fn generate_zk_proof(
        &self,
        circuit_wasm: &[u8],
        proving_key: &[u8],
        public_inputs: &[String],
        private_inputs: &[String],
    ) -> Result<TargonZKResponse> {
        // Use an external base64 crate or custom encode logic if base64 is missing
        use base64::{engine::general_purpose, Engine as _};
        let request = TargonZKRequest {
            circuit_wasm: general_purpose::STANDARD.encode(circuit_wasm),
            proving_key: general_purpose::STANDARD.encode(proving_key),
            public_inputs: public_inputs.to_vec(),
            private_inputs: private_inputs.to_vec(),
            tee_type: Some("sev".to_string()),
            require_attestation: Some(true),
        };

        let responses = self.bittensor
            .query_subnet_with_fallback::<_, TargonZKResponse>(
                self.subnet_id,
                "zk_prove",
                &request,
                2,
                1,
            )
            .await?;

        let best = &responses[0];
        best.data.clone().ok_or_else(|| anyhow!("Resposta vazia da SN4"))
    }
    /*
    /// Gera prova para o verifier da Cathedral (integrado)
    pub async fn generate_cathedral_proof(
        &self,
        vulnerability: &crate::integrations::openant::Vulnerability,
        code: &str,
    ) -> Result<crate::integrations::openant::VulnerabilityProof> {
        // Converte a vulnerabilidade para inputs do circuito
        let public_inputs = vec![
            hex::encode(vulnerability.id.as_bytes()),
            vulnerability.severity.to_string(),
            vulnerability.location.clone(),
        ];

        let private_inputs = vec![
            hex::encode(code.as_bytes()),
            hex::encode(vulnerability.description.as_bytes()),
        ];

        // Carrega o circuito e a proving key (deveriam estar no sistema)
        let circuit = include_bytes!("../circuit/zk_vuln_circuit.wasm");
        let pk = include_bytes!("../circuit/zk_proving_key.bin");

        let response = self.generate_zk_proof(
            circuit,
            pk,
            &public_inputs,
            &private_inputs,
        ).await?;

        // Constrói a prova no formato da Cathedral
        Ok(crate::integrations::openant::VulnerabilityProof {
            result_hash: hex::encode(&vulnerability.id),
            signature: response.proof,
            attestor_public_key: response.attestation.unwrap_or_default(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            openant_version: "0.3.0+zk-tee".to_string(),
        })
    }
    */
}
