//! Real blockchain integration for x402 payments
//!
//! This module provides real blockchain interactions for:
//! - Transaction monitoring
//! - Balance checking
//! - Network status verification
//! - Gas estimation

use crate::{Result, X402Error};
use serde::{Deserialize, Serialize};

/// Blockchain client for real network interactions
pub struct BlockchainClient {
    /// RPC endpoint URL
    rpc_url: String,
    /// Network name
    pub network: String,
    /// HTTP client for RPC calls
    client: reqwest::Client,
}

/// Blockchain transaction status
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TransactionStatus {
    Pending,
    Confirmed,
    Failed,
    Unknown,
}

/// Blockchain transaction information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionInfo {
    pub hash: String,
    pub status: TransactionStatus,
    pub block_number: Option<u64>,
    pub gas_used: Option<u64>,
    pub effective_gas_price: Option<String>,
    pub from: String,
    pub to: String,
    pub value: String,
}

/// Balance information for an address
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceInfo {
    pub address: String,
    pub balance: String,
    pub token_balance: Option<String>,
    pub token_address: Option<String>,
}

/// Network information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub chain_id: u64,
    pub network_name: String,
    pub latest_block: u64,
    pub gas_price: String,
}

impl BlockchainClient {
    /// Create a new blockchain client
    pub fn new(rpc_url: String, network: String) -> Self {
        Self {
            rpc_url,
            network,
            client: reqwest::Client::new(),
        }
    }

    /// Get transaction status by hash
    pub async fn get_transaction_status(&self, tx_hash: &str) -> Result<TransactionInfo> {
        let response = self
            .client
            .post(&self.rpc_url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_getTransactionByHash",
                "params": [tx_hash],
                "id": 1
            }))
            .send()
            .await
            .map_err(|e| X402Error::network_error(format!("RPC request failed: {}", e)))?;

        let response_json: serde_json::Value = response.json().await.map_err(|e| {
            X402Error::network_error(format!("Failed to parse RPC response: {}", e))
        })?;

        if let Some(result) = response_json.get("result") {
            if result.is_null() {
                return Ok(TransactionInfo {
                    hash: tx_hash.to_string(),
                    status: TransactionStatus::Unknown,
                    block_number: None,
                    gas_used: None,
                    effective_gas_price: None,
                    from: "".to_string(),
                    to: "".to_string(),
                    value: "".to_string(),
                });
            }

            let block_number = result
                .get("blockNumber")
                .and_then(|v| v.as_str())
                .and_then(|s| u64::from_str_radix(s.trim_start_matches("0x"), 16).ok());

            // Get transaction receipt for gas information
            let gas_info = self.get_transaction_receipt(tx_hash).await.ok();

            Ok(TransactionInfo {
                hash: tx_hash.to_string(),
                status: if block_number.is_some() {
                    TransactionStatus::Confirmed
                } else {
                    TransactionStatus::Pending
                },
                block_number,
                gas_used: gas_info
                    .as_ref()
                    .and_then(|r| r.get("gasUsed"))
                    .and_then(|v| {
                        v.as_str()
                            .and_then(|s| u64::from_str_radix(s.trim_start_matches("0x"), 16).ok())
                    }),
                effective_gas_price: gas_info
                    .as_ref()
                    .and_then(|r| r.get("effectiveGasPrice"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                from: result
                    .get("from")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                to: result
                    .get("to")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                value: result
                    .get("value")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0x0")
                    .to_string(),
            })
        } else {
            Err(X402Error::network_error(
                "Invalid RPC response format".to_string(),
            ))
        }
    }

    /// Get transaction receipt
    async fn get_transaction_receipt(&self, tx_hash: &str) -> Result<serde_json::Value> {
        let response = self
            .client
            .post(&self.rpc_url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_getTransactionReceipt",
                "params": [tx_hash],
                "id": 1
            }))
            .send()
            .await
            .map_err(|e| X402Error::network_error(format!("RPC request failed: {}", e)))?;

        let response_json: serde_json::Value = response.json().await.map_err(|e| {
            X402Error::network_error(format!("Failed to parse RPC response: {}", e))
        })?;

        response_json
            .get("result")
            .ok_or_else(|| X402Error::network_error("No result in RPC response".to_string()))
            .cloned()
    }

    /// Get balance for an address
    pub async fn get_balance(&self, address: &str) -> Result<BalanceInfo> {
        let response = self
            .client
            .post(&self.rpc_url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_getBalance",
                "params": [address, "latest"],
                "id": 1
            }))
            .send()
            .await
            .map_err(|e| X402Error::network_error(format!("RPC request failed: {}", e)))?;

        let response_json: serde_json::Value = response.json().await.map_err(|e| {
            X402Error::network_error(format!("Failed to parse RPC response: {}", e))
        })?;

        let balance = response_json
            .get("result")
            .and_then(|v| v.as_str())
            .unwrap_or("0x0")
            .to_string();

        Ok(BalanceInfo {
            address: address.to_string(),
            balance,
            token_balance: None,
            token_address: None,
        })
    }

    /// Get USDC balance for an address
    pub async fn get_usdc_balance(&self, address: &str) -> Result<BalanceInfo> {
        let usdc_contract = self.get_usdc_contract_address()?;

        // Call balanceOf function on USDC contract
        let response = self
            .client
            .post(&self.rpc_url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_call",
                "params": [{
                    "to": usdc_contract,
                    "data": format!("0x70a08231000000000000000000000000{}", address.trim_start_matches("0x"))
                }, "latest"],
                "id": 1
            }))
            .send()
            .await
            .map_err(|e| X402Error::network_error(format!("RPC request failed: {}", e)))?;

        let response_json: serde_json::Value = response.json().await.map_err(|e| {
            X402Error::network_error(format!("Failed to parse RPC response: {}", e))
        })?;

        let token_balance = response_json
            .get("result")
            .and_then(|v| v.as_str())
            .unwrap_or("0x0")
            .to_string();

        Ok(BalanceInfo {
            address: address.to_string(),
            balance: "0x0".to_string(), // We're only getting token balance
            token_balance: Some(token_balance),
            token_address: Some(usdc_contract),
        })
    }

    /// Get network information
    pub async fn get_network_info(&self) -> Result<NetworkInfo> {
        // Get chain ID
        let chain_id_response = self
            .client
            .post(&self.rpc_url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_chainId",
                "params": [],
                "id": 1
            }))
            .send()
            .await
            .map_err(|e| X402Error::network_error(format!("RPC request failed: {}", e)))?;

        let chain_id_json: serde_json::Value = chain_id_response.json().await.map_err(|e| {
            X402Error::network_error(format!("Failed to parse RPC response: {}", e))
        })?;

        let chain_id = chain_id_json
            .get("result")
            .and_then(|v| v.as_str())
            .and_then(|s| u64::from_str_radix(s.trim_start_matches("0x"), 16).ok())
            .unwrap_or(0);

        // Get latest block number
        let block_response = self
            .client
            .post(&self.rpc_url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_blockNumber",
                "params": [],
                "id": 1
            }))
            .send()
            .await
            .map_err(|e| X402Error::network_error(format!("RPC request failed: {}", e)))?;

        let block_json: serde_json::Value = block_response.json().await.map_err(|e| {
            X402Error::network_error(format!("Failed to parse RPC response: {}", e))
        })?;

        let latest_block = block_json
            .get("result")
            .and_then(|v| v.as_str())
            .and_then(|s| u64::from_str_radix(s.trim_start_matches("0x"), 16).ok())
            .unwrap_or(0);

        // Get gas price
        let gas_response = self
            .client
            .post(&self.rpc_url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_gasPrice",
                "params": [],
                "id": 1
            }))
            .send()
            .await
            .map_err(|e| X402Error::network_error(format!("RPC request failed: {}", e)))?;

        let gas_json: serde_json::Value = gas_response.json().await.map_err(|e| {
            X402Error::network_error(format!("Failed to parse RPC response: {}", e))
        })?;

        let gas_price = gas_json
            .get("result")
            .and_then(|v| v.as_str())
            .unwrap_or("0x0")
            .to_string();

        Ok(NetworkInfo {
            chain_id,
            network_name: self.network.clone(),
            latest_block,
            gas_price,
        })
    }

    /// Estimate gas for a transaction
    pub async fn estimate_gas(&self, transaction: &TransactionRequest) -> Result<u64> {
        let response = self
            .client
            .post(&self.rpc_url)
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "method": "eth_estimateGas",
                "params": [transaction],
                "id": 1
            }))
            .send()
            .await
            .map_err(|e| X402Error::network_error(format!("RPC request failed: {}", e)))?;

        let response_json: serde_json::Value = response.json().await.map_err(|e| {
            X402Error::network_error(format!("Failed to parse RPC response: {}", e))
        })?;

        let gas_hex = response_json
            .get("result")
            .and_then(|v| v.as_str())
            .ok_or_else(|| X402Error::network_error("No gas estimate in response".to_string()))?;

        u64::from_str_radix(gas_hex.trim_start_matches("0x"), 16)
            .map_err(|_| X402Error::network_error("Invalid gas estimate format".to_string()))
    }

    /// Get USDC contract address for current network
    pub fn get_usdc_contract_address(&self) -> Result<String> {
        match self.network.as_str() {
            "base-sepolia" => Ok("0x036CbD53842c5426634e7929541eC2318f3dCF7e".to_string()),
            "base" => Ok("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".to_string()),
            "avalanche-fuji" => Ok("0x5425890298aed601595a70AB815c96711a31Bc65".to_string()),
            "avalanche" => Ok("0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E".to_string()),
            _ => Err(X402Error::invalid_network(format!(
                "Unsupported network: {}",
                self.network
            ))),
        }
    }
}

/// Transaction request for gas estimation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionRequest {
    pub from: String,
    pub to: String,
    pub value: Option<String>,
    pub data: Option<String>,
    pub gas: Option<String>,
    pub gas_price: Option<String>,
}

/// Blockchain client factory
pub struct BlockchainClientFactory;

impl BlockchainClientFactory {
    /// Create client for Base Sepolia testnet
    pub fn base_sepolia() -> BlockchainClient {
        BlockchainClient::new(
            "https://sepolia.base.org".to_string(),
            "base-sepolia".to_string(),
        )
    }

    /// Create client for Base mainnet
    pub fn base() -> BlockchainClient {
        BlockchainClient::new("https://mainnet.base.org".to_string(), "base".to_string())
    }

    /// Create client for Avalanche Fuji testnet
    pub fn avalanche_fuji() -> BlockchainClient {
        BlockchainClient::new(
            "https://api.avax-test.network/ext/bc/C/rpc".to_string(),
            "avalanche-fuji".to_string(),
        )
    }

    /// Create client for Avalanche mainnet
    pub fn avalanche() -> BlockchainClient {
        BlockchainClient::new(
            "https://api.avax.network/ext/bc/C/rpc".to_string(),
            "avalanche".to_string(),
        )
    }

    /// Create client with custom RPC URL
    pub fn custom(rpc_url: &str, network: &str) -> BlockchainClient {
        BlockchainClient::new(rpc_url.to_string(), network.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blockchain_client_creation() {
        let client =
            BlockchainClient::new("https://example.com".to_string(), "testnet".to_string());
        assert_eq!(client.network, "testnet");
    }

    #[test]
    fn test_usdc_contract_address() {
        let client = BlockchainClient::new(
            "https://example.com".to_string(),
            "base-sepolia".to_string(),
        );
        let address = client.get_usdc_contract_address().unwrap();
        assert_eq!(address, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    }

    #[test]
    fn test_transaction_request_serialization() {
        let tx = TransactionRequest {
            from: "0x123".to_string(),
            to: "0x456".to_string(),
            value: Some("0x1000".to_string()),
            data: None,
            gas: None,
            gas_price: None,
        };

        let json = serde_json::to_string(&tx).unwrap();
        assert!(json.contains("0x123"));
    }
}
