use ethers::prelude::*;
use bytes::Bytes;
use tracing::{info, error};
use std::sync::Arc;

use crate::evolution::desci_node_resource::{RoyaltyConfig, RoyaltySplit};

abigen!(
    IPicnicBasket,
    r#"[
        function deposit(uint256 amount, address receiver) external returns (uint256 shares)
        function totalAssets() external view returns (uint256)
        function convertToAssets(uint256 shares) external view returns (uint256)
        function distributeRewards(address[] calldata recipients, uint256[] calldata amounts) external
    ]"#
);

pub struct X402RoyaltyServer {
    pub facilitator_url: String,
    pub picnic_basket_address: Option<Address>,
    pub provider: Option<Provider<Http>>,
    pub wallet: Option<LocalWallet>,
}

impl X402RoyaltyServer {
    pub fn new(facilitator_url: &str) -> Self {
        Self {
            facilitator_url: facilitator_url.to_string(),
            picnic_basket_address: None,
            provider: None,
            wallet: None,
        }
    }

    pub fn with_picnic(mut self, address: Address, provider: Provider<Http>, wallet: LocalWallet) -> Self {
        self.picnic_basket_address = Some(address);
        self.provider = Some(provider);
        self.wallet = Some(wallet);
        self
    }

    pub fn npub_to_eth_address(&self, npub: &str) -> String {
        format!("0x{}", hex::encode(npub.as_bytes()).chars().take(40).collect::<String>())
    }

    pub fn protect_route(
        &self,
        _royalty_config: &RoyaltyConfig,
    ) {
        // Mock middleware configuration
    }

    pub async fn settle_payment_with_picnic(
        &self,
        payment_amount: u64,
        royalty_splits: &[RoyaltySplit],
    ) -> Result<(), String> {
        let basket_address = self.picnic_basket_address.ok_or("Picnic basket address not configured")?;
        let provider = self.provider.as_ref().ok_or("Provider not configured")?;
        let wallet = self.wallet.as_ref().ok_or("Wallet not configured")?;

        let client = Arc::new(SignerMiddleware::new(provider.clone(), wallet.clone()));
        let contract = IPicnicBasket::new(basket_address, client.clone());

        let receipt = contract
            .deposit(U256::from(payment_amount), client.address())
            .send()
            .await
            .map_err(|e| format!("Erro no depósito: {}", e))?
            .await
            .map_err(|e| format!("Erro ao confirmar depósito: {}", e))?
            .ok_or_else(|| "Recibo não encontrado".to_string())?;

        info!("✅ USDC depositado no Picnic Basket: tx={:?}", receipt.transaction_hash);

        let total_shares = contract.total_assets().call().await
            .map_err(|e| format!("Erro ao obter total_assets: {}", e))?;

        let mut recipients = Vec::new();
        let mut amounts = Vec::new();

        for split in royalty_splits {
            let share_amount = (total_shares.as_u64() as f64 * split.share as f64) as u64;
            let address = self.npub_to_eth_address(&split.npub);
            recipients.push(address.parse().map_err(|_| "Invalid address")?);
            amounts.push(U256::from(share_amount));
        }

        let receipt2 = contract
            .distribute_rewards(recipients, amounts)
            .send()
            .await
            .map_err(|e| format!("Erro na distribuição: {}", e))?
            .await
            .map_err(|e| format!("Erro ao confirmar distribuição: {}", e))?
            .ok_or_else(|| "Recibo não encontrado".to_string())?;

        info!("✅ Royalties distribuídos: tx={:?}", receipt2.transaction_hash);

        Ok(())
    }

    pub async fn verify_basket(&self, basket_address: &Address) -> Result<(), String> {
        let provider = self.provider.as_ref().ok_or("Provider not configured")?;
        let wallet = self.wallet.as_ref().ok_or("Wallet not configured")?;
        let client = Arc::new(SignerMiddleware::new(provider.clone(), wallet.clone()));
        let contract = IPicnicBasket::new(*basket_address, client);

        let _total = contract.total_assets().call().await
            .map_err(|e| format!("Basket não responde ou inválido: {}", e))?;
        Ok(())
    }
}

pub struct X402Client {
    pub client: reqwest::Client,
}

impl X402Client {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    pub async fn download_with_payment(
        &self,
        url: &str,
        wallet_private_key: &str,
    ) -> Result<Bytes, String> {
        let response = self.client.get(url).send().await
            .map_err(|e| format!("Erro na requisição: {}", e))?;

        if response.status() != reqwest::StatusCode::PAYMENT_REQUIRED {
            return response.bytes().await.map_err(|e| e.to_string());
        }

        let payment_instructions = response.headers()
            .get("x-402-payment")
            .and_then(|v| v.to_str().ok())
            .ok_or("Instruções de pagamento não encontradas")?;

        let signature = self.sign_payment(payment_instructions, wallet_private_key);

        let final_response = self.client
            .get(url)
            .header("PAYMENT-SIGNATURE", signature)
            .send()
            .await
            .map_err(|e| format!("Erro no pagamento: {}", e))?;

        if final_response.status().is_success() {
            final_response.bytes().await.map_err(|e| e.to_string())
        } else {
            Err("Falha no pagamento".to_string())
        }
    }

    fn sign_payment(&self, _instructions: &str, _private_key: &str) -> String {
        "signed_payment".to_string()
    }
}
