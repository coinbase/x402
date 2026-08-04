// src/multi_chain/agent.rs

use crate::integrations::across::bridge::{AcrossClient, AcrossIntent};
use crate::integrations::asichain::agent::{ASIAgentConfig, ASIAgentDeployer};
use crate::integrations::bitcoin::cittamarket::{CITAnchor, CittamarketClient};
use crate::integrations::cosmos::ibc::IbcAgentRegistry;
use crate::integrations::ethereum::identity::EthereumIdentityManager;
use crate::integrations::oracles::AGIOracle;
use crate::integrations::solana::client::SolanaAgentClient;
use crate::multi_chain::executor::CrossChainExecutor;
use bitcoin::Network;
use ethers::types::Address;
use std::str::FromStr;

pub struct AGIIdentity {
    pub agent_id: [u8; 32],
    pub dpid: String,
    pub public_key: [u8; 32],
    pub private_key: [u8; 32],
    pub eth_address: String,
}

impl AGIIdentity {
    pub async fn anchor_to_bitcoin(&self) -> Result<String, String> {
        let secp = bitcoin::secp256k1::Secp256k1::new();
        let sk = bitcoin::PrivateKey::from_slice(&self.private_key, Network::Bitcoin)
            .map_err(|e| e.to_string())?;
        let pk = bitcoin::PublicKey::from_private_key(&secp, &sk);

        let mut pubkey_bytes = [0u8; 33];
        pubkey_bytes.copy_from_slice(&pk.to_bytes());

        let anchor = CITAnchor::new(&pubkey_bytes, &self.agent_id);
        let client = CittamarketClient::new(
            Network::Bitcoin,
            &std::env::var("BITCOIN_RPC_URL").unwrap_or_default(),
            sk,
        );
        client.anchor_identity(&anchor).await
    }
}

pub struct AGIMemory {
    pub permanent: ([u8; 32], String),
}

pub struct AGIReasoning {}

pub struct MultiChainAgent {
    pub identity: AGIIdentity,                 // Bitcoin + ERC-725
    pub memory: AGIMemory,                     // Arweave + WormGraph
    pub reasoning: AGIReasoning,               // AO + vLLM
    pub executor: Box<dyn CrossChainExecutor>, // Across + deBridge
    pub oracle: AGIOracle,                     // APRO + DIA
    pub solana_agent: SolanaAgentClient,       // Programa Solana
    pub asichain_agent: ASIAgentDeployer,      // ASI:Chain
    pub ibc_registry: IbcAgentRegistry,        // Cosmos IBC
}

impl MultiChainAgent {
    pub async fn receive_payment(
        &self,
        from_chain: u64,
        amount: u64,
        across: &AcrossClient,
    ) -> Result<String, String> {
        let quote = across.get_quote(from_chain, 8453, amount).await?; // Bridge para Base
        let intent = AcrossIntent {
            from_chain,
            to_chain: 8453, // Base
            amount: quote.output_amount,
            recipient: self.identity.eth_address.clone(),
            referrer: None,
        };
        across.bridge_usdc(&intent).await
    }

    pub async fn deploy_to_asichain(&self) -> Result<String, String> {
        let config = ASIAgentConfig {
            name: format!("AGI-{}", hex::encode(self.identity.agent_id)),
            description: "Cathedral ARKHE AGI on ASI:Chain".to_string(),
            token_id: self.identity.dpid.clone(),
            arweave_txid: hex::encode(self.memory.permanent.0),
            owner_key: self.identity.private_key.to_vec(),
        };
        let deployer = ASIAgentDeployer::new(config).await?;
        deployer.deploy().await
    }

    /// Registra a AGI em todas as cadeias simultaneamente
    pub async fn register_globally(&self) -> Result<(), String> {
        // 1. Bitcoin: ancoragem CITTAMARKET
        let btc_txid = self.identity.anchor_to_bitcoin().await?;
        println!("✅ Bitcoin anchor: {}", btc_txid);

        // 2. Ethereum: contrato ERC-725
        let contract_addr =
            Address::from_str("0x0000000000000000000000000000000000000000").unwrap();
        let eth_manager = EthereumIdentityManager::new(
            "http://localhost:8545",
            &hex::encode(self.identity.private_key),
            contract_addr,
        )
        .await;
        let eth_tx = eth_manager.update_identity(self.memory.permanent.0).await?;
        println!("✅ Ethereum identity: {:?}", eth_tx);

        // 3. Solana: programa agente
        let solana_pda = self
            .solana_agent
            .initialize_agent(self.identity.agent_id, self.memory.permanent.0)
            .await?;
        println!("✅ Solana agent: {}", solana_pda);

        // 4. ASI:Chain: deploy do agente
        let asi_addr = self.asichain_agent.deploy().await?;
        println!("✅ ASI:Chain agent: {}", asi_addr);

        // 5. Cosmos: registro IBC
        self.ibc_registry
            .register_agent(
                &hex::encode(self.identity.agent_id),
                &hex::encode(self.memory.permanent.0),
                &hex::encode(self.identity.public_key),
            )
            .await?;
        println!("✅ Cosmos IBC registered");

        Ok(())
    }
}
