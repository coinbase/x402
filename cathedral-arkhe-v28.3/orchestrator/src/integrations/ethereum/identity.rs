// src/integrations/ethereum/identity.rs

use ethers::contract::abigen;
use ethers::prelude::*;
use ethers::utils::keccak256;
use std::sync::Arc;

abigen!(AGIIdentity, "contracts/AGIIdentity.json");

pub struct EthereumIdentityManager {
    client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    contract: AGIIdentity<SignerMiddleware<Provider<Http>, LocalWallet>>,
}

impl EthereumIdentityManager {
    pub async fn new(rpc_url: &str, private_key: &str, contract_addr: Address) -> Self {
        let provider = Provider::<Http>::try_from(rpc_url).unwrap();
        let wallet = private_key.parse::<LocalWallet>().unwrap();
        let client = Arc::new(SignerMiddleware::new(provider, wallet.clone()));
        let contract = AGIIdentity::new(contract_addr, client.clone());
        Self { client, contract }
    }

    pub async fn update_identity(&self, arweave_txid: [u8; 32]) -> Result<H256, String> {
        let tx = self.contract.update_identity(arweave_txid);
        let pending = tx.send().await.map_err(
            |e: ContractError<SignerMiddleware<Provider<Http>, LocalWallet>>| e.to_string(),
        )?;
        let receipt = pending.await.map_err(|e: ProviderError| e.to_string())?;
        Ok(receipt.unwrap().transaction_hash)
    }

    pub async fn create_proposal(
        &self,
        description: &str,
        voting_blocks: u64,
    ) -> Result<u64, String> {
        let desc_hash = keccak256(description.as_bytes());
        let tx = self
            .contract
            .create_proposal(desc_hash, voting_blocks.into());
        let pending = tx.send().await.map_err(
            |e: ContractError<SignerMiddleware<Provider<Http>, LocalWallet>>| e.to_string(),
        )?;
        let _receipt = pending.await.map_err(|e: ProviderError| e.to_string())?;
        // Extrai proposalId do evento
        Ok(0) // STUB
    }

    pub async fn vote(&self, proposal_id: u64, support: bool) -> Result<(), String> {
        let tx = self.contract.vote(proposal_id.into(), support);
        let pending = tx.send().await.map_err(
            |e: ContractError<SignerMiddleware<Provider<Http>, LocalWallet>>| e.to_string(),
        )?;
        pending.await.map_err(|e: ProviderError| e.to_string())?;
        Ok(())
    }
}
