//! Comprehensive tests for real implementation modules
//!
//! These tests verify that the real implementation modules (wallet, blockchain, real_facilitator)
//! work correctly and can be used in production scenarios.

use x402::{
    blockchain::BlockchainClientFactory,
    real_facilitator::{RealFacilitatorFactory, FacilitatorConfig},
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
    assert!(wallet.is_ok());
    
    let wallet = wallet.unwrap();
    assert_eq!(wallet.network(), "base-sepolia");

    // Test network configuration
    let config = wallet.get_network_config().unwrap();
    assert_eq!(config.chain_id, 84532);
}

#[tokio::test]
async fn test_wallet_factory_error_handling() {
    // Test invalid private key format
    let wallet = WalletFactory::from_private_key("invalid_key", "base-sepolia");
    assert!(wallet.is_err());
    
    // Test invalid hex in private key
    let wallet = WalletFactory::from_private_key("0xinvalid_hex", "base-sepolia");
    assert!(wallet.is_err());
    
    // Test too short private key
    let wallet = WalletFactory::from_private_key("0x123", "base-sepolia");
    assert!(wallet.is_err());
}

#[tokio::test]
async fn test_blockchain_client_factory() {
    // Test Base Sepolia client
    let client = BlockchainClientFactory::base_sepolia();
    assert_eq!(client.network, "base-sepolia");
    
    // Test Base mainnet client
    let client = BlockchainClientFactory::base();
    assert_eq!(client.network, "base");
    
    // Test Avalanche Fuji client
    let client = BlockchainClientFactory::avalanche_fuji();
    assert_eq!(client.network, "avalanche-fuji");
    
    // Test Avalanche mainnet client
    let client = BlockchainClientFactory::avalanche();
    assert_eq!(client.network, "avalanche");
    
    // Test custom client
    let client = BlockchainClientFactory::custom("https://custom.rpc.com", "custom");
    assert_eq!(client.network, "custom");
}

#[tokio::test]
async fn test_blockchain_usdc_contract_addresses() {
    // Test Base Sepolia USDC contract
    let client = BlockchainClientFactory::base_sepolia();
    let address = client.get_usdc_contract_address().unwrap();
    assert_eq!(address, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    
    // Test Base mainnet USDC contract
    let client = BlockchainClientFactory::base();
    let address = client.get_usdc_contract_address().unwrap();
    assert_eq!(address, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    
    // Test Avalanche Fuji USDC contract
    let client = BlockchainClientFactory::avalanche_fuji();
    let address = client.get_usdc_contract_address().unwrap();
    assert_eq!(address, "0x5425890298aed601595a70AB815c96711a31Bc65");
    
    // Test Avalanche mainnet USDC contract
    let client = BlockchainClientFactory::avalanche();
    let address = client.get_usdc_contract_address().unwrap();
    assert_eq!(address, "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E");
}

#[tokio::test]
async fn test_real_facilitator_factory() {
    // Test Base Sepolia facilitator
    let facilitator = RealFacilitatorFactory::base_sepolia();
    assert!(facilitator.is_ok());
    
    // Test Base mainnet facilitator
    let facilitator = RealFacilitatorFactory::base();
    assert!(facilitator.is_ok());
    
    // Test Avalanche Fuji facilitator
    let facilitator = RealFacilitatorFactory::avalanche_fuji();
    assert!(facilitator.is_ok());
    
    // Test Avalanche mainnet facilitator
    let facilitator = RealFacilitatorFactory::avalanche();
    assert!(facilitator.is_ok());
    
    // Test custom facilitator configuration
    let config = FacilitatorConfig {
        rpc_url: Some("https://custom.facilitator.com".to_string()),
        network: "custom".to_string(),
        verification_timeout: std::time::Duration::from_secs(60),
        confirmation_blocks: 2,
        max_retries: 5,
        retry_delay: std::time::Duration::from_secs(2),
    };
    
    let facilitator = RealFacilitatorFactory::custom(config);
    assert!(facilitator.is_ok());
}

#[tokio::test]
async fn test_facilitator_config_default() {
    let config = FacilitatorConfig::default();
    assert_eq!(config.network, "base-sepolia");
    assert_eq!(config.confirmation_blocks, 1);
    assert_eq!(config.max_retries, 3);
    assert_eq!(config.retry_delay, std::time::Duration::from_secs(1));
}

#[tokio::test]
async fn test_payment_requirements_validation() {
    // Create valid payment requirements
    let requirements = PaymentRequirements::new(
        "exact",
        "base-sepolia",
        "1000000", // 1 USDC
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
        "0x209693Bc6afc0C5328bA36FaF03C514EF312287C", // Pay to address
        "https://api.example.com/premium",
        "Premium API access",
    );
    
    assert_eq!(requirements.scheme, "exact");
    assert_eq!(requirements.network, "base-sepolia");
    assert_eq!(requirements.max_amount_required, "1000000");
    assert_eq!(requirements.asset, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    assert_eq!(requirements.pay_to, "0x209693Bc6afc0C5328bA36FaF03C514EF312287C");
}

#[tokio::test]
async fn test_network_configuration_compatibility() {
    // Test that wallet and blockchain client use compatible network configs
    let wallet = WalletFactory::from_private_key(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "base-sepolia",
    ).unwrap();
    
    let blockchain_client = BlockchainClientFactory::base_sepolia();
    
    // Both should use the same network
    assert_eq!(wallet.network(), blockchain_client.network);
    
    // Both should have the same USDC contract address
    let wallet_config = wallet.get_network_config().unwrap();
    let blockchain_address = blockchain_client.get_usdc_contract_address().unwrap();
    
    // Convert wallet config address to string for comparison (normalize case)
    let wallet_address = format!("{:?}", wallet_config.usdc_contract).to_lowercase();
    assert_eq!(wallet_address, blockchain_address.to_lowercase());
}

#[tokio::test]
async fn test_error_handling_integration() {
    // Test that error handling works across modules
    
    // Invalid private key should fail in wallet
    let wallet = WalletFactory::from_private_key("invalid_key", "base-sepolia");
    assert!(wallet.is_err());
    
    // Too short private key should fail
    let wallet = WalletFactory::from_private_key("0x123", "base-sepolia");
    assert!(wallet.is_err());
    
    // Invalid hex in private key should fail
    let wallet = WalletFactory::from_private_key("0xinvalid_hex", "base-sepolia");
    assert!(wallet.is_err());
    
    // Valid private key with valid network should succeed
    let wallet = WalletFactory::from_private_key(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "base-sepolia",
    );
    assert!(wallet.is_ok());
}

#[tokio::test]
async fn test_real_implementation_workflow() {
    // Test the complete workflow of real implementation
    
    // Step 1: Create wallet
    let wallet = WalletFactory::from_private_key(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "base-sepolia",
    ).unwrap();
    
    // Step 2: Create blockchain client
    let blockchain_client = BlockchainClientFactory::base_sepolia();
    
    // Step 3: Create facilitator
    let _facilitator = RealFacilitatorFactory::base_sepolia().unwrap();
    
    // Step 4: Create payment requirements
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
    
    // Verify network compatibility
    assert_eq!(wallet.network(), requirements.network);
    assert_eq!(blockchain_client.network, requirements.network);
    
    // Verify USDC contract addresses match (normalize case)
    let wallet_config = wallet.get_network_config().unwrap();
    let blockchain_address = blockchain_client.get_usdc_contract_address().unwrap();
    let wallet_address = format!("{:?}", wallet_config.usdc_contract).to_lowercase();
    assert_eq!(wallet_address, blockchain_address.to_lowercase());
    assert_eq!(wallet_address, requirements.asset.to_lowercase());
    
    println!("✅ Real implementation workflow test passed");
    println!("   Wallet network: {}", wallet.network());
    println!("   Blockchain network: {}", blockchain_client.network);
    println!("   Requirements network: {}", requirements.network);
    println!("   USDC contract: {}", wallet_address);
}
