use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZKProof {
    pub proof_type: String,
    pub hash: String,
    pub original_len: usize,
}

pub struct ZKGateway {}

impl ZKGateway {
    pub fn new() -> Self {
        ZKGateway {}
    }

    pub async fn sample(&self, _output: &str, _rate: f64) -> Result<String, String> {
        Ok("sampled".to_string())
    }

    pub async fn prove_nanozk(&self, _sampled: String) -> Result<ZKProof, String> {
        Ok(ZKProof {
            proof_type: "NANOZK-sim".to_string(),
            hash: "hash_mock".to_string(),
            original_len: 0,
        })
    }

    pub async fn prove_deepprove(&self, _sampled: String) -> Result<ZKProof, String> {
        Ok(ZKProof {
            proof_type: "DeepProve-sim".to_string(),
            hash: "hash_mock".to_string(),
            original_len: 0,
        })
    }
}
