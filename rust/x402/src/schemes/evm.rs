use std::str::FromStr;
use alloy::primitives::{Address, U256, B256};
use std::time::{SystemTime, UNIX_EPOCH};
use alloy::sol_types::Eip712Domain;
use alloy::signers::{Signature, Signer};
use crate::types::PaymentRequirements;
use crate::errors::X402Result;
use alloy::sol;
use rand::RngCore;

// EIP-712 structure for the Exact scheme
sol! {
    #[derive(Debug)]
    struct TransferWithAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }
}

/// Creates x402 EIP-712 Domain
pub fn create_exact_eip3009_domain(
    requirements: &PaymentRequirements,
    chain_id: u64,
) -> Eip712Domain {
    // extra must contain { name, version }
    let extra = requirements
        .extra
        .as_ref()
        .expect("requirements.extra must be present for EIP-712 domain");
    let name = extra["name"]
        .as_str()
        .expect("extra.name must be a string");
    let version = extra["version"]
        .as_str()
        .expect("extra.version must be a string");

    let verifying_contract: Address = requirements
        .asset
        .as_ref()
        .expect("asset (token contract) must be present")
        .parse()
        .expect("asset must be a valid 0x address");

    Eip712Domain {
        name: Some(name.to_string().into()),
        version: Some(version.to_string().into()),
        chain_id: Some(U256::from(chain_id)),
        verifying_contract: Some(verifying_contract),
        salt: None,
    }
}

pub async fn sign_transfer_with_authorization<S>(
    signer: &S,
    wallet_address: &str,
    requirement: &PaymentRequirements,
    chain_id: u64,
) -> X402Result<(String, TransferWithAuthorization)>
where
    S: Signer<Signature> + Send + Sync,
{
    // 1. Addresses
    let from: Address = wallet_address.parse()
        .map_err(|e| crate::errors::X402Error::Internal(format!("Invalid from address: {e}")))?;
    let to: Address = requirement.pay_to.parse()
        .map_err(|e| crate::errors::X402Error::Internal(format!("Invalid to address: {e}")))?;

    // 2. Value (atomic units as decimal string)
    let value = U256::from_str(&requirement.amount)
        .map_err(|e| crate::errors::X402Error::Internal(format!("Invalid amount: {e}")))?;

    // 3. Time window
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let valid_after = U256::from(now.saturating_sub(600)); // 10 minutes before
    let valid_before = U256::from(now + 600); // 10 minutes after (or use your max_timeout)

    // 4. Nonce
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let nonce = B256::from(bytes);

    let auth = TransferWithAuthorization {
        from,
        to,
        value,
        validAfter: valid_after,
        validBefore: valid_before,
        nonce,
    };

    // 5. Domain from requirements
    let domain = create_exact_eip3009_domain(requirement, chain_id);

    // 6. Sign typed data
    let signature = signer
        .sign_typed_data(&auth, &domain)
        .await
        .map_err(|e| crate::errors::X402Error::Internal(e.to_string()))?;

    let signature_hex = format!("0x{}", hex::encode(signature.as_bytes()));

    Ok((signature_hex, auth))
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::signers::local::PrivateKeySigner;
    use alloy::sol_types::SolStruct;

    #[test]
    fn test_create_exact_eip3009_domain() {
        let chain_id = 1u64;
        let mut extra = serde_json::Map::new();
        extra.insert("name".to_string(), serde_json::Value::String("USD Coin".to_string()));
        extra.insert("version".to_string(), serde_json::Value::String("2".to_string()));

        let requirements = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "ethereum".to_string(),
            pay_to: "0x1234567890123456789012345678901234567890".to_string(),
            amount: "1000000".to_string(),
            asset: Some("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".to_string()),
            data: None,
            extra: Some(serde_json::Value::Object(extra)),
        };

        let domain = create_exact_eip3009_domain(&requirements, chain_id);

        assert_eq!(domain.name.as_deref(), Some("USD Coin"));
        assert_eq!(domain.version.as_deref(), Some("2"));
        assert_eq!(domain.chain_id, Some(U256::from(chain_id)));
        assert_eq!(domain.verifying_contract, Some("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".parse().unwrap()));
        assert_eq!(domain.salt, None);
    }

    #[test]
    fn test_transfer_with_authorization_structure() {
        let from = Address::repeat_byte(1);
        let to = Address::repeat_byte(2);
        let value = U256::from(100);
        let valid_after = U256::from(0);
        let valid_before = U256::from(1000);
        let nonce = B256::repeat_byte(3);

        let auth = TransferWithAuthorization {
            from,
            to,
            value,
            validAfter: valid_after,
            validBefore: valid_before,
            nonce,
        };

        assert_eq!(auth.from, from);
        assert_eq!(auth.to, to);
        assert_eq!(auth.value, value);
        assert_eq!(auth.validAfter, valid_after);
        assert_eq!(auth.validBefore, valid_before);
        assert_eq!(auth.nonce, nonce);
    }

    #[tokio::test]
    async fn test_sign_transfer_with_authorization() {
        let signer = PrivateKeySigner::random();
        let wallet_address = format!("{:?}", signer.address());
        let chain_id = 1;

        let mut extra = serde_json::Map::new();
        extra.insert("name".to_string(), serde_json::Value::String("USD Coin".to_string()));
        extra.insert("version".to_string(), serde_json::Value::String("2".to_string()));

        let requirement = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "ethereum".to_string(),
            pay_to: "0x1234567890123456789012345678901234567890".to_string(),
            amount: "1000000000000000000".to_string(),
            asset: Some("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".to_string()),
            data: None,
            extra: Some(serde_json::Value::Object(extra)),
        };

        let result = sign_transfer_with_authorization(&signer, &wallet_address, &requirement, chain_id).await;

        assert!(result.is_ok());
        let (signature_hex, auth) = result.unwrap();
        assert!(signature_hex.starts_with("0x"));
        // Signature is 65 bytes -> 130 hex chars + 2 for "0x" = 132
        assert_eq!(signature_hex.len(), 132);
        
        assert_eq!(auth.value, U256::from_str(&requirement.amount).unwrap());
    }

    #[tokio::test]
    async fn test_eip712_signature_recovers_expected_address() {
        // This test proves:
        // 1. The TransferWithAuthorization struct is correct
        // 2. The Eip712Domain derived from PaymentRequirements is correct
        // 3. The signature is a valid ECDSA signature over (domain, auth)
        // 4. The recovered address matches the expected address

        let signer = PrivateKeySigner::random();
        let expected_address: Address = signer.address();
        let wallet_address_str = expected_address.to_string();
        let chain_id = 84532u64;

        let mut extra = serde_json::Map::new();
        extra.insert("name".to_string(), serde_json::Value::String("x402".to_string()));
        extra.insert("version".to_string(), serde_json::Value::String("1".to_string()));

        let requirement = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "eip155:84532".to_string(),
            pay_to: "0x1234567890123456789012345678901234567890".to_string(),
            amount: "1000".to_string(),
            asset: Some("0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_string()),
            data: None,
            extra: Some(serde_json::Value::Object(extra)),
        };

        let (signature_hex, auth) = sign_transfer_with_authorization(
            &signer,
            &wallet_address_str,
            &requirement,
            chain_id,
        )
            .await
            .expect("sign_transfer_with_authorization failed");

        let domain = create_exact_eip3009_domain(&requirement, chain_id);

        // sol!-generated helper: compute EIP-712 digest for this struct + domain
        let digest: B256 = auth.eip712_signing_hash(&domain);

        let sig_bytes = hex::decode(signature_hex.trim_start_matches("0x")).unwrap();
        let signature = Signature::try_from(sig_bytes.as_slice()).unwrap();

        let recovered = signature
            .recover_address_from_prehash(&digest)
            .expect("recover_address failed");

        assert_eq!(recovered, expected_address, "Recovered address mismatch");
    }
}


