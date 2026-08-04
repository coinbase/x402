use ed25519_dalek::{SigningKey, Signature, VerifyingKey, Signer};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PqcError {
    #[error("Key generation failed")]
    KeygenFailed,
    #[error("Signing failed")]
    SigningFailed,
    #[error("Verification failed")]
    VerificationFailed,
    #[error("Invalid key")]
    InvalidKey,
    #[error("ML-DSA not available (feature not enabled)")]
    MldsaUnavailable,
}

pub enum PqcAlgorithm {
    Ed25519,
}

pub struct PqcKeyPair {
    pub public_key: Vec<u8>,
    pub private_key: Vec<u8>,
    pub algorithm: PqcAlgorithm,
}

impl PqcKeyPair {
    pub fn generate(algorithm: PqcAlgorithm) -> Result<Self, PqcError> {
        match algorithm {
            PqcAlgorithm::Ed25519 => {
                let mut csprng = OsRng {};
                let sk = SigningKey::generate(&mut csprng);
                Ok(Self {
                    public_key: sk.verifying_key().to_bytes().to_vec(),
                    private_key: sk.to_bytes().to_vec(),
                    algorithm,
                })
            }
        }
    }

    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>, PqcError> {
        match &self.algorithm {
            PqcAlgorithm::Ed25519 => {
                let sk = SigningKey::from_bytes(&self.private_key.clone().try_into().unwrap());
                let sig: Signature = sk.sign(message);
                Ok(sig.to_bytes().to_vec())
            }
        }
    }

    pub fn verify(&self, message: &[u8], signature: &[u8]) -> Result<bool, PqcError> {
        match &self.algorithm {
            PqcAlgorithm::Ed25519 => {
                let pk = VerifyingKey::from_bytes(&self.public_key.clone().try_into().unwrap())
                    .map_err(|_| PqcError::InvalidKey)?;
                let sig = Signature::from_bytes(signature.try_into().unwrap());
                Ok(pk.verify_strict(message, &sig).is_ok())
            }
        }
    }
}
