//! Integração com contratos Picnic (DeFi Basket) para gestão de royalties.

use ethers::prelude::*;
use tracing::info;
use std::sync::Arc;


abigen!(
    IPicnicBasket,
    r#"[
        function deposit(uint256 amount, address receiver) external returns (uint256 shares)
        function totalAssets() external view returns (uint256)
        function distributeRewards(address[] calldata recipients, uint256[] calldata amounts) external
    ]"#
);

#[derive(Debug, Clone)]
pub struct PicnicRoyaltyManager {
    client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    basket_address: Address,
}

impl PicnicRoyaltyManager {
    pub fn new(
        rpc_url: &str,
        private_key: &str,
        basket_address: Address,
    ) -> Result<Self, String> {
        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| format!("Erro ao conectar ao provider: {}", e))?;
        let wallet: LocalWallet = private_key
            .parse()
            .map_err(|e| format!("Chave privada inválida: {}", e))?;
        let client = Arc::new(SignerMiddleware::new(provider, wallet));

        Ok(Self {
            client,
            basket_address,
        })
    }

    pub async fn verify_basket(&self) -> Result<(), String> {
        let contract = IPicnicBasket::new(self.basket_address, self.client.clone());
        let _total = contract.total_assets().call().await
            .map_err(|e| format!("Basket não responde ou inválido: {}", e))?;
        info!("✅ Basket Picnic verificado: {}", self.basket_address);
        Ok(())
    }

    pub async fn deposit_and_distribute(
        &self,
        amount_usdc: u64,
        splits: &[crate::evolution::desci_node_resource::RoyaltySplit],
    ) -> Result<TxHash, String> {
        if amount_usdc == 0 {
            return Err("Valor de depósito zero".to_string());
        }
        if splits.is_empty() {
            return Err("Nenhum split definido".to_string());
        }

        let contract = IPicnicBasket::new(self.basket_address, self.client.clone());

        info!("📤 Depositando {} USDC no basket...", amount_usdc);
        let receipt = contract
            .deposit(U256::from(amount_usdc), self.client.address())
            .send()
            .await
            .map_err(|e| format!("Erro no depósito: {}", e))?
            .await
            .map_err(|e| format!("Erro ao confirmar depósito: {}", e))?
            .ok_or_else(|| "Recibo de transação não encontrado".to_string())?;

        info!("✅ Depósito confirmado: tx={:?}", receipt.transaction_hash);

        let total_assets = contract.total_assets().call().await
            .map_err(|e| format!("Erro ao obter totalAssets: {}", e))?;
        let total = total_assets.as_u64();

        if total == 0 {
            return Err("Total de ativos zero após depósito".to_string());
        }

        let mut recipients = Vec::new();
        let mut amounts = Vec::new();

        for split in splits {
            if let Some(eth_addr) = &split.eth_address {
                let addr: Address = eth_addr.parse()
                    .map_err(|_| format!("Endereço Ethereum inválido: {}", eth_addr))?;

                let share = split.share.clamp(0.0, 1.0);
                let share_amount = (total as f64 * share as f64) as u64;
                if share_amount > 0 {
                    recipients.push(addr);
                    amounts.push(U256::from(share_amount));
                }
            } else {
                return Err(format!("Endereço Ethereum não definido para {}", split.npub));
            }
        }

        if recipients.is_empty() {
            return Err("Nenhum destinatário com share positiva".to_string());
        }

        info!("📤 Distribuindo shares para {} destinatários...", recipients.len());
        let receipt2 = contract
            .distribute_rewards(recipients, amounts)
            .send()
            .await
            .map_err(|e| format!("Erro na distribuição: {}", e))?
            .await
            .map_err(|e| format!("Erro ao confirmar distribuição: {}", e))?
            .ok_or_else(|| "Recibo de transação de distribuição não encontrado".to_string())?;

        info!("✅ Distribuição confirmada: tx={:?}", receipt2.transaction_hash);

        Ok(receipt2.transaction_hash)
    }

    pub fn parse_address(addr: &str) -> Result<Address, String> {
        addr.parse().map_err(|_| format!("Endereço inválido: {}", addr))
    }
}
