use std::path::PathBuf;

// Dummy implementation of QVAC Vault
pub struct QvacVault {}

impl QvacVault {
    pub fn new(_tee_url: &str, _attestation_cert: &PathBuf) -> Result<Self, String> {
        Ok(Self {})
    }

    pub async fn sign_message(&self, _key_id: &str, _message: &[u8]) -> Result<Vec<u8>, String> {
        Ok(vec![])
    }

    pub async fn verify_tee(&self) -> Result<bool, String> {
        Ok(true)
    }
}
