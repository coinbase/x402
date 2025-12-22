use std::borrow::Cow;
use alloy::primitives::Signature;
use alloy::sol_types::{SolStruct, Eip712Domain};
use alloy::signers::Signer;
use crate::types::{PaymentRequired, PaymentRequirements};
use crate::errors::X402Result;
use alloy::sol;

// EIP-712 structure for the Exact scheme
sol! {
    #[derive(Debug)]
    struct ExactPayment {
        uint32 x402Version;
        string resource;
        string scheme;
        string network;
        string payTo;
        string value;
        string asset;
    }
}

/// Creates x402 EIP-712 Domain
pub fn create_x402_domain(chain_id: u64) -> Eip712Domain {
    Eip712Domain {
        name: Some(Cow::from("x402".to_string())),
        version: Some(Cow::from("1".to_string())),
        chain_id: Some(alloy::primitives::U256::from(chain_id)),
        verifying_contract: None,
        salt: None,
    }
}

/// Helper to sign an EVM payment using EIP-712
pub async fn sign_exact_payment<S>(
    signer: &S,
    challenge: &PaymentRequired,
    requirement: &PaymentRequirements,
    chain_id: u64,
) -> X402Result<String>
where
    S: Signer<Signature> + Send + Sync,
{
    let payment = ExactPayment {
        x402Version: challenge.x402_version,
        resource: challenge.resource.clone(),
        scheme: requirement.scheme.clone(),
        network: requirement.network.clone(),
        payTo: requirement.pay_to.clone(),
        value: requirement.value.clone(),
        asset: requirement.asset.clone().unwrap_or_default(),
    };

    let domain = create_x402_domain(chain_id);
    let signature = signer.sign_typed_data(&payment, &domain)
        .await
        .map_err(|e| crate::errors::X402Error::Internal(e.to_string()))?;

    Ok(format!("0x{}", hex::encode(signature.as_bytes())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::signers::local::PrivateKeySigner;

    #[test]
    fn test_create_x402_domain() {
        let chain_id = 1u64;
        let domain = create_x402_domain(chain_id);

        assert_eq!(domain.name.as_deref(), Some("x402"));
        assert_eq!(domain.version.as_deref(), Some("1"));
        assert_eq!(domain.chain_id, Some(alloy::primitives::U256::from(chain_id)));
        assert_eq!(domain.verifying_contract, None);
        assert_eq!(domain.salt, None);
    }

    #[test]
    fn test_exact_payment_structure() {
        let payment = ExactPayment {
            x402Version: 1,
            resource: "/api/resource".to_string(),
            scheme: "exact".to_string(),
            network: "ethereum".to_string(),
            payTo: "0x1234567890123456789012345678901234567890".to_string(),
            value: "1000000000000000000".to_string(),
            asset: "ETH".to_string(),
        };

        assert_eq!(payment.x402Version, 1);
        assert_eq!(payment.resource, "/api/resource");
        assert_eq!(payment.scheme, "exact");
        assert_eq!(payment.network, "ethereum");
        assert_eq!(payment.payTo, "0x1234567890123456789012345678901234567890");
        assert_eq!(payment.value, "1000000000000000000");
        assert_eq!(payment.asset, "ETH");
    }

    #[tokio::test]
    async fn test_sign_exact_payment() {
        let signer = PrivateKeySigner::random();
        let chain_id = 1;

        let challenge = PaymentRequired {
            x402_version: 1,
            resource: "/api/resource".to_string(),
            accepts: vec![],
            description: None,
            extensions: None,
        };

        let requirement = PaymentRequirements {
            scheme: "exact".to_string(),
            network: "ethereum".to_string(),
            pay_to: "0x1234567890123456789012345678901234567890".to_string(),
            value: "1000000000000000000".to_string(),
            asset: Some("ETH".to_string()),
            data: None,
        };

        let result = sign_exact_payment(&signer, &challenge, &requirement, chain_id).await;

        assert!(result.is_ok());
        let signature = result.unwrap();
        assert!(signature.starts_with("0x"));
        // Signature is 65 bytes -> 130 hex chars + 2 for "0x" = 132
        assert_eq!(signature.len(), 132);
    }
}


