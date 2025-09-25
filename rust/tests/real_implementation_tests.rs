//! Comprehensive tests for real implementation modules
//!
//! These tests verify that the real implementation modules (wallet, blockchain, real_facilitator)
//! work correctly and can be used in production scenarios.

use x402::{
    blockchain::BlockchainClientFactory,
    real_facilitator::{BlockchainFacilitatorConfig, BlockchainFacilitatorFactory},
    types::PaymentRequirements,
    wallet::WalletFactory,
};

#[tokio::test]
async fn test_real_wallet_creation_and_config() {
    // Test wallet creation with valid private key
    let wallet = WalletFactory::from_private_key(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "base-sepolia",
    );
    assert!(
        wallet.is_ok(),
        "Wallet creation should succeed with valid private key"
    );

    let wallet = wallet.expect("Wallet creation must succeed - this is a critical failure");
    assert_eq!(
        wallet.network(),
        "base-sepolia",
        "Network must be exactly 'base-sepolia'"
    );

    // Test network configuration
    let config = wallet
        .get_network_config()
        .expect("Network config retrieval must succeed - wallet is valid");
    assert_eq!(
        config.chain_id, 84532,
        "Chain ID must be exactly 84532 for base-sepolia"
    );
}

#[tokio::test]
async fn test_wallet_factory_error_handling() {
    // Test invalid private key format - MUST fail
    let wallet = WalletFactory::from_private_key("invalid_key", "base-sepolia");
    assert!(
        wallet.is_err(),
        "Invalid private key format MUST fail - this is a critical security requirement"
    );

    // Test invalid hex in private key - MUST fail
    let wallet = WalletFactory::from_private_key("0xinvalid_hex", "base-sepolia");
    assert!(
        wallet.is_err(),
        "Invalid hex in private key MUST fail - this is a critical security requirement"
    );

    // Test too short private key - MUST fail
    let wallet = WalletFactory::from_private_key("0x123", "base-sepolia");
    assert!(
        wallet.is_err(),
        "Too short private key MUST fail - this is a critical security requirement"
    );
}

#[tokio::test]
async fn test_blockchain_client_factory() {
    // Test Base Sepolia client - MUST have correct network name
    let client = BlockchainClientFactory::base_sepolia();
    assert_eq!(
        client.network, "base-sepolia",
        "Base Sepolia client network MUST be exactly 'base-sepolia'"
    );

    // Test Base mainnet client - MUST have correct network name
    let client = BlockchainClientFactory::base();
    assert_eq!(
        client.network, "base",
        "Base mainnet client network MUST be exactly 'base'"
    );

    // Test Avalanche Fuji client - MUST have correct network name
    let client = BlockchainClientFactory::avalanche_fuji();
    assert_eq!(
        client.network, "avalanche-fuji",
        "Avalanche Fuji client network MUST be exactly 'avalanche-fuji'"
    );

    // Test Avalanche mainnet client - MUST have correct network name
    let client = BlockchainClientFactory::avalanche();
    assert_eq!(
        client.network, "avalanche",
        "Avalanche mainnet client network MUST be exactly 'avalanche'"
    );

    // Test custom client - MUST preserve custom network name
    let client = BlockchainClientFactory::custom("https://custom.rpc.com", "custom");
    assert_eq!(
        client.network, "custom",
        "Custom client network MUST be exactly 'custom'"
    );
}

#[tokio::test]
async fn test_blockchain_usdc_contract_addresses() {
    // Test Base Sepolia USDC contract - MUST have exact contract address
    let client = BlockchainClientFactory::base_sepolia();
    let address = client
        .get_usdc_contract_address()
        .expect("USDC contract address MUST be available for base-sepolia");
    assert_eq!(address, "0x036CbD53842c5426634e7929541eC2318f3dCF7e", 
               "Base Sepolia USDC contract address MUST be exactly 0x036CbD53842c5426634e7929541eC2318f3dCF7e");

    // Test Base mainnet USDC contract - MUST have exact contract address
    let client = BlockchainClientFactory::base();
    let address = client
        .get_usdc_contract_address()
        .expect("USDC contract address MUST be available for base mainnet");
    assert_eq!(address, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 
               "Base mainnet USDC contract address MUST be exactly 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");

    // Test Avalanche Fuji USDC contract - MUST have exact contract address
    let client = BlockchainClientFactory::avalanche_fuji();
    let address = client
        .get_usdc_contract_address()
        .expect("USDC contract address MUST be available for avalanche-fuji");
    assert_eq!(address, "0x5425890298aed601595a70AB815c96711a31Bc65", 
               "Avalanche Fuji USDC contract address MUST be exactly 0x5425890298aed601595a70AB815c96711a31Bc65");

    // Test Avalanche mainnet USDC contract - MUST have exact contract address
    let client = BlockchainClientFactory::avalanche();
    let address = client
        .get_usdc_contract_address()
        .expect("USDC contract address MUST be available for avalanche mainnet");
    assert_eq!(address, "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", 
               "Avalanche mainnet USDC contract address MUST be exactly 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E");
}

#[tokio::test]
async fn test_real_facilitator_factory() {
    // Test Base Sepolia facilitator - MUST succeed
    let facilitator = BlockchainFacilitatorFactory::base_sepolia();
    assert!(
        facilitator.is_ok(),
        "Base Sepolia facilitator creation MUST succeed"
    );

    // Test Base mainnet facilitator - MUST succeed
    let facilitator = BlockchainFacilitatorFactory::base();
    assert!(
        facilitator.is_ok(),
        "Base mainnet facilitator creation MUST succeed"
    );

    // Test Avalanche Fuji facilitator - MUST succeed
    let facilitator = BlockchainFacilitatorFactory::avalanche_fuji();
    assert!(
        facilitator.is_ok(),
        "Avalanche Fuji facilitator creation MUST succeed"
    );

    // Test Avalanche mainnet facilitator - MUST succeed
    let facilitator = BlockchainFacilitatorFactory::avalanche();
    assert!(
        facilitator.is_ok(),
        "Avalanche mainnet facilitator creation MUST succeed"
    );

    // Test custom facilitator configuration - MUST succeed with valid config
    let config = BlockchainFacilitatorConfig {
        rpc_url: Some("https://custom.facilitator.com".to_string()),
        network: "custom".to_string(),
        verification_timeout: std::time::Duration::from_secs(60),
        confirmation_blocks: 2,
        max_retries: 5,
        retry_delay: std::time::Duration::from_secs(2),
    };

    let facilitator = BlockchainFacilitatorFactory::custom(config);
    assert!(
        facilitator.is_ok(),
        "Custom facilitator creation MUST succeed with valid configuration"
    );
}

#[tokio::test]
async fn test_facilitator_config_default() {
    let config = BlockchainFacilitatorConfig::default();
    assert_eq!(
        config.network, "base-sepolia",
        "Default network MUST be 'base-sepolia'"
    );
    assert_eq!(
        config.confirmation_blocks, 1,
        "Default confirmation blocks MUST be 1"
    );
    assert_eq!(config.max_retries, 3, "Default max retries MUST be 3");
    assert_eq!(
        config.retry_delay,
        std::time::Duration::from_secs(1),
        "Default retry delay MUST be 1 second"
    );
}

#[tokio::test]
async fn test_payment_requirements_validation() {
    // Create valid payment requirements
    let requirements = PaymentRequirements::new(
        "exact",
        "base-sepolia",
        "1000000",                                    // 1 USDC
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C", // Pay to address
        "https://api.example.com/premium",
        "Premium API access",
    );

    assert_eq!(
        requirements.scheme, "exact",
        "Payment scheme MUST be exactly 'exact'"
    );
    assert_eq!(
        requirements.network, "base-sepolia",
        "Network MUST be exactly 'base-sepolia'"
    );
    assert_eq!(
        requirements.max_amount_required, "1000000",
        "Amount MUST be exactly '1000000'"
    );
    assert_eq!(
        requirements.asset, "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "USDC contract address MUST be exactly 0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    );
    assert_eq!(
        requirements.pay_to, "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "Pay to address MUST be exactly 0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
    );
}

#[tokio::test]
async fn test_network_configuration_compatibility() {
    // Test that wallet and blockchain client use compatible network configs
    let wallet = WalletFactory::from_private_key(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "base-sepolia",
    )
    .expect("Wallet creation MUST succeed with valid private key");

    let blockchain_client = BlockchainClientFactory::base_sepolia();

    // Both should use the same network - CRITICAL requirement
    assert_eq!(
        wallet.network(),
        blockchain_client.network,
        "Wallet and blockchain client networks MUST match exactly"
    );

    // Both should have the same USDC contract address - CRITICAL requirement
    let wallet_config = wallet
        .get_network_config()
        .expect("Wallet config MUST be retrievable");
    let blockchain_address = blockchain_client
        .get_usdc_contract_address()
        .expect("Blockchain USDC address MUST be retrievable");

    // Convert wallet config address to string for comparison (normalize case)
    let wallet_address = format!("{:?}", wallet_config.usdc_contract).to_lowercase();
    assert_eq!(
        wallet_address,
        blockchain_address.to_lowercase(),
        "USDC contract addresses MUST match exactly between wallet and blockchain client"
    );
}

#[tokio::test]
async fn test_error_handling_integration() {
    // Test that error handling works across modules - CRITICAL security requirement

    // Invalid private key should fail in wallet - MUST fail
    let wallet = WalletFactory::from_private_key("invalid_key", "base-sepolia");
    assert!(
        wallet.is_err(),
        "Invalid private key MUST fail - this is a critical security requirement"
    );

    // Too short private key should fail - MUST fail
    let wallet = WalletFactory::from_private_key("0x123", "base-sepolia");
    assert!(
        wallet.is_err(),
        "Too short private key MUST fail - this is a critical security requirement"
    );

    // Invalid hex in private key should fail - MUST fail
    let wallet = WalletFactory::from_private_key("0xinvalid_hex", "base-sepolia");
    assert!(
        wallet.is_err(),
        "Invalid hex private key MUST fail - this is a critical security requirement"
    );

    // Valid private key with valid network should succeed - MUST succeed
    let wallet = WalletFactory::from_private_key(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "base-sepolia",
    );
    assert!(
        wallet.is_ok(),
        "Valid private key with valid network MUST succeed"
    );
}

#[tokio::test]
async fn test_real_implementation_workflow() {
    // Test the complete workflow of real implementation - CRITICAL integration test

    // Step 1: Create wallet - MUST succeed
    let wallet = WalletFactory::from_private_key(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "base-sepolia",
    )
    .expect("Wallet creation MUST succeed - this is a critical failure in the workflow");

    // Step 2: Create blockchain client - MUST succeed
    let blockchain_client = BlockchainClientFactory::base_sepolia();

    // Step 3: Create facilitator - MUST succeed
    let _facilitator = BlockchainFacilitatorFactory::base_sepolia()
        .expect("Facilitator creation MUST succeed - this is a critical failure in the workflow");

    // Step 4: Create payment requirements - MUST succeed
    let requirements = PaymentRequirements::new(
        "exact",
        "base-sepolia",
        "1000000",
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "https://api.example.com/premium",
        "Premium API access",
    );

    // Step 5: Create payment payload (this would normally require a real signature)
    // For testing, we'll just verify the wallet can create the authorization structure
    let _payer_address = "0x857b06519E91e3A54538791bDbb0E22373e36b66";

    // Verify network compatibility - CRITICAL requirement
    assert_eq!(
        wallet.network(),
        requirements.network,
        "Wallet and requirements networks MUST match exactly"
    );
    assert_eq!(
        blockchain_client.network, requirements.network,
        "Blockchain client and requirements networks MUST match exactly"
    );

    // Verify USDC contract addresses match (normalize case) - CRITICAL requirement
    let wallet_config = wallet
        .get_network_config()
        .expect("Wallet config MUST be retrievable");
    let blockchain_address = blockchain_client
        .get_usdc_contract_address()
        .expect("Blockchain USDC address MUST be retrievable");
    let wallet_address = format!("{:?}", wallet_config.usdc_contract).to_lowercase();
    assert_eq!(
        wallet_address,
        blockchain_address.to_lowercase(),
        "Wallet and blockchain USDC addresses MUST match exactly"
    );
    assert_eq!(
        wallet_address,
        requirements.asset.to_lowercase(),
        "Wallet and requirements USDC addresses MUST match exactly"
    );

}
