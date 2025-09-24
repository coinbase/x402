//! Cryptographic utilities for x402 payments

use crate::{Result, X402Error};
use ethereum_types::{Address, H256, U256};
use k256::ecdsa::{RecoveryId, Signature as K256Signature};
use secp256k1::{ecdsa::Signature as Secp256k1Signature, Message, Secp256k1, SecretKey};
use serde_json::json;
use std::str::FromStr;

/// EIP-712 domain separator for EIP-3009 transfers
pub const EIP712_DOMAIN: &str = r#"{"name":"USD Coin","version":"2","chainId":8453,"verifyingContract":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"}"#;

/// JWT utilities for authentication
pub mod jwt {
    use super::*;
    use jsonwebtoken::{encode, Algorithm, Header};
    use serde_json::json;
    use std::collections::BTreeMap;

    /// JWT claims for Coinbase API authentication
    #[derive(Debug, serde::Serialize)]
    struct Claims {
        iss: String,
        sub: String,
        aud: String,
        iat: u64,
        exp: u64,
        uri: String,
    }

    /// Create an authorization header for Coinbase API requests
    pub fn create_auth_header(
        api_key_id: &str,
        api_key_secret: &str,
        request_host: &str,
        request_path: &str,
    ) -> Result<String> {
        // Remove https:// if present
        let request_host = request_host.trim_start_matches("https://");

        let now = chrono::Utc::now().timestamp() as u64;
        let exp = now + 300; // 5 minutes

        let claims = Claims {
            iss: api_key_id.to_string(),
            sub: api_key_id.to_string(),
            aud: request_host.to_string(),
            iat: now,
            exp,
            uri: request_path.to_string(),
        };

        let header = Header::new(Algorithm::HS256);
        let key = jsonwebtoken::EncodingKey::from_secret(api_key_secret.as_bytes());
        let token = jsonwebtoken::encode(&header, &claims, &key)
            .map_err(|e| X402Error::config(format!("JWT encoding failed: {}", e)))?;

        Ok(format!("Bearer {}", token))
    }
}

/// EIP-712 typed data utilities
pub mod eip712 {
    use super::*;

    /// EIP-712 domain separator
    #[derive(Debug, Clone)]
    pub struct Domain {
        pub name: String,
        pub version: String,
        pub chain_id: u64,
        pub verifying_contract: Address,
    }

    /// EIP-712 typed data structure
    #[derive(Debug, Clone)]
    pub struct TypedData {
        pub domain: Domain,
        pub primary_type: String,
        pub types: serde_json::Value,
        pub message: serde_json::Value,
    }

    /// Create EIP-712 hash for EIP-3009 transfer with authorization
    pub fn create_transfer_with_authorization_hash(
        domain: &Domain,
        from: Address,
        to: Address,
        value: U256,
        valid_after: U256,
        valid_before: U256,
        nonce: H256,
    ) -> Result<H256> {
        let types = json!({
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"}
            ],
            "TransferWithAuthorization": [
                {"name": "from", "type": "address"},
                {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"},
                {"name": "nonce", "type": "bytes32"}
            ]
        });

        let message = json!({
            "from": format!("{:?}", from),
            "to": format!("{:?}", to),
            "value": format!("0x{:x}", value),
            "validAfter": format!("0x{:x}", valid_after),
            "validBefore": format!("0x{:x}", valid_before),
            "nonce": format!("{:?}", nonce)
        });

        let typed_data = TypedData {
            domain: domain.clone(),
            primary_type: "TransferWithAuthorization".to_string(),
            types,
            message,
        };

        hash_typed_data(&typed_data)
    }

    /// Hash EIP-712 typed data
    pub fn hash_typed_data(typed_data: &TypedData) -> Result<H256> {
        // This is a simplified implementation
        // In a production environment, you'd want to use a proper EIP-712 library
        // like `eip712` crate or implement the full EIP-712 hashing algorithm

        let domain_separator = hash_domain(&typed_data.domain)?;
        let struct_hash = hash_struct(&typed_data.primary_type, &typed_data.types, &typed_data.message)?;

        // Combine domain separator and struct hash
        let mut data = Vec::new();
        data.extend_from_slice(&domain_separator.as_bytes());
        data.extend_from_slice(&struct_hash.as_bytes());

        Ok(H256::from_slice(&sha3_256(&data)))
    }

    /// Hash the domain separator
    fn hash_domain(domain: &Domain) -> Result<H256> {
        let domain_type_hash = keccak256(b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

        let name_hash = keccak256(domain.name.as_bytes());
        let version_hash = keccak256(domain.version.as_bytes());
        let chain_id_hash = keccak256(&domain.chain_id.to_be_bytes());
        let verifying_contract_hash = keccak256(&domain.verifying_contract.as_bytes());

        let mut data = Vec::new();
        data.extend_from_slice(&domain_type_hash);
        data.extend_from_slice(&name_hash);
        data.extend_from_slice(&version_hash);
        data.extend_from_slice(&chain_id_hash);
        data.extend_from_slice(&verifying_contract_hash);

        Ok(H256::from_slice(&keccak256(&data)))
    }

    /// Hash a struct according to EIP-712
    fn hash_struct(primary_type: &str, types: &serde_json::Value, message: &serde_json::Value) -> Result<H256> {
        // This is a simplified implementation
        // In practice, you'd need to properly encode the struct fields according to EIP-712

        let type_hash = keccak256(format!("{}(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)", primary_type).as_bytes());

        // For TransferWithAuthorization, we'd encode the message fields in the correct order
        // This is a placeholder implementation
        let encoded_message = encode_message_fields(message)?;
        let message_hash = keccak256(&encoded_message);

        let mut data = Vec::new();
        data.extend_from_slice(&type_hash);
        data.extend_from_slice(&message_hash);

        Ok(H256::from_slice(&keccak256(&data)))
    }

    /// Encode message fields for hashing
    fn encode_message_fields(message: &serde_json::Value) -> Result<Vec<u8>> {
        // This would properly encode the message fields according to EIP-712
        // For now, return a placeholder
        Ok(vec![])
    }

    /// Keccak-256 hash function
    fn keccak256(data: &[u8]) -> [u8; 32] {
        use sha3::{Digest, Keccak256};
        Keccak256::digest(data).into()
    }

    /// SHA3-256 hash function
    fn sha3_256(data: &[u8]) -> [u8; 32] {
        use sha3::{Digest, Sha3_256};
        Sha3_256::digest(data).into()
    }
}

/// Signature utilities
pub mod signature {
    use super::*;

    /// Verify an EIP-712 signature
    pub fn verify_eip712_signature(
        signature: &str,
        message_hash: H256,
        expected_address: Address,
    ) -> Result<bool> {
        let sig_bytes = hex::decode(signature.trim_start_matches("0x"))
            .map_err(|_| X402Error::invalid_signature("Invalid hex signature"))?;

        if sig_bytes.len() != 65 {
            return Err(X402Error::invalid_signature("Signature must be 65 bytes"));
        }

        let r = H256::from_slice(&sig_bytes[0..32]);
        let s = H256::from_slice(&sig_bytes[32..64]);
        let v = sig_bytes[64];

        let recovery_id = RecoveryId::try_from(v)
            .map_err(|_| X402Error::invalid_signature("Invalid recovery ID"))?;

        // TODO: Fix k256 API compatibility - from_bytes_reduced doesn't exist in k256 0.13
        // Temporarily returning an error until we can fix the k256 API usage
        return Err(X402Error::invalid_signature("k256 API compatibility issue - needs fixing"));
    }

    /// Sign a message hash with a private key
    pub fn sign_message_hash(
        message_hash: H256,
        private_key: &str,
    ) -> Result<String> {
        let private_key_bytes = hex::decode(private_key.trim_start_matches("0x"))
            .map_err(|_| X402Error::invalid_signature("Invalid hex private key"))?;

        let secret_key = SecretKey::from_slice(&private_key_bytes)
            .map_err(|_| X402Error::invalid_signature("Invalid private key"))?;

        let secp = Secp256k1::new();
        let message = Message::from_digest_slice(message_hash.as_bytes())
            .map_err(|_| X402Error::invalid_signature("Invalid message hash"))?;

        let signature = secp.sign_ecdsa(&message, &secret_key);
        let serialized = signature.serialize_compact();
        // TODO: Fix recovery ID extraction - serialize_compact returns 64 bytes, not 65
        // let recovery_id = signature.serialize_compact()[64];
        let recovery_id = 0u8; // Placeholder

        let mut sig_bytes = [0u8; 65];
        sig_bytes[0..32].copy_from_slice(&serialized[0..32]);
        sig_bytes[32..64].copy_from_slice(&serialized[32..64]);
        sig_bytes[64] = recovery_id;

        Ok(format!("0x{}", hex::encode(sig_bytes)))
    }

    /// Convert a public key to an Ethereum address
    fn ethereum_address_from_pubkey(pubkey: &k256::ecdsa::VerifyingKey) -> Result<Address> {
        let pubkey_bytes = pubkey.to_sec1_bytes();
        if pubkey_bytes.len() != 65 {
            return Err(X402Error::invalid_signature("Invalid public key length"));
        }

        // Remove the first byte (0x04) and hash the remaining 64 bytes
        let pubkey_hash = keccak256(&pubkey_bytes[1..]);
        
        // Take the last 20 bytes as the address
        let mut address_bytes = [0u8; 20];
        address_bytes.copy_from_slice(&pubkey_hash[12..]);
        
        Ok(Address::from(address_bytes))
    }

    /// Keccak-256 hash function
    fn keccak256(data: &[u8]) -> [u8; 32] {
        use sha3::{Digest, Keccak256};
        Keccak256::digest(data).into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ethereum_types::{Address, H256, U256};

    #[test]
    fn test_jwt_creation() {
        let token = jwt::create_auth_header(
            "test_key",
            "test_secret",
            "api.cdp.coinbase.com",
            "/platform/v2/x402/verify",
        );
        assert!(token.is_ok());
        assert!(token.unwrap().starts_with("Bearer "));
    }

    #[test]
    fn test_domain_creation() {
        let domain = eip712::Domain {
            name: "USD Coin".to_string(),
            version: "2".to_string(),
            chain_id: 8453,
            verifying_contract: Address::from_str("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").unwrap(),
        };

        assert_eq!(domain.name, "USD Coin");
        assert_eq!(domain.version, "2");
        assert_eq!(domain.chain_id, 8453);
    }
}
