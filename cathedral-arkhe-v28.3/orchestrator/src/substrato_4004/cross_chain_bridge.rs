//! src/substrato_4004/cross_chain_bridge.rs
//! Bridge entre B20 (Base) e XRPL escrows

pub struct B20XrplBridge {
    b20_settlement: Arc<B20SettlementEngine>,
    xrpl_bridge: Arc<X402XrplBridge>, // Substrato 4003
    cross_chain_emitter: Arc<CrossChainEmitterV2>,
}

impl B20XrplBridge {
    /// Converte pagamento B20 para escrow XRPL
    pub async fn b20_to_xrpl_escrow(&self, payment: &B20Payment) -> Result<String, BridgeError> {
        // 1. Avalia compliance B20
        let action = payment.to_action();
        let compliance = self
            .b20_settlement
            .compliance_engine
            .evaluate_compliance(&action)
            .await?;

        if !compliance.overall {
            return Err(BridgeError::ComplianceFailed(compliance));
        }

        // 2. Congela tokens B20 (mint para escrow bridge)
        let escrow_address = self.get_bridge_escrow_address().await?;
        let freeze_tx = self
            .b20_settlement
            .execute_b20_operation(&B20Operation::Transfer {
                token: payment.token,
                from: payment.from,
                to: escrow_address,
                amount: payment.amount,
                memo: Some(self.memo_tracer.generate_memo(&action)),
                policy_scope: PolicyScope::TransferSender,
            })
            .await?;

        // 3. Cria escrow equivalente no XRPL
        let xrpl_escrow_id = self
            .xrpl_bridge
            .create_settlement_escrow(&payment.to_x402_payment())
            .await?;

        // 4. Emite evento cross-chain
        self.cross_chain_emitter
            .emit_cross_chain(OrchestratorEvent::B20ToXrplBridge {
                b20_tx_hash: freeze_tx,
                xrpl_escrow_id: xrpl_escrow_id.clone(),
                amount: payment.amount.to_string(),
                token: format!("{:?}", payment.token),
                timestamp: chrono::Utc::now().timestamp(),
            })
            .await?;

        Ok(xrpl_escrow_id)
    }

    /// Libera tokens B20 quando escrow XRPL é finalizado
    pub async fn xrpl_to_b20_release(
        &self,
        xrpl_escrow_id: &str,
        b20_recipient: Address,
    ) -> Result<String, BridgeError> {
        // 1. Verifica que escrow XRPL foi liberado
        let escrow_state = self
            .xrpl_bridge
            .escrow_manager
            .get_state(xrpl_escrow_id)
            .await?;

        if !escrow_state.released {
            return Err(BridgeError::EscrowNotReleased(xrpl_escrow_id.to_string()));
        }

        // 2. Libera tokens B20 do escrow bridge
        let escrow_address = self.get_bridge_escrow_address().await?;
        let release_tx = self
            .b20_settlement
            .execute_b20_operation(&B20Operation::Transfer {
                token: escrow_state.token,
                from: escrow_address,
                to: b20_recipient,
                amount: escrow_state.amount,
                memo: Some(hash_memo("xrpl-release", xrpl_escrow_id)),
                policy_scope: PolicyScope::TransferSender,
            })
            .await?;

        // 3. Emite evento
        self.cross_chain_emitter
            .emit_cross_chain(OrchestratorEvent::XrplToB20Release {
                xrpl_escrow_id: xrpl_escrow_id.to_string(),
                b20_tx_hash: release_tx,
                recipient: format!("{:?}", b20_recipient),
                timestamp: chrono::Utc::now().timestamp(),
            })
            .await?;

        Ok(release_tx)
    }
}
