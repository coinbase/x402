//! src/substrato_4004/memo_tracer.rs
//! Rastreia memos B20 para integração com EventStore e CrossChainEmitter

pub struct MemoTracer {
    event_store: Arc<EventStore>,
    cross_chain_emitter: Arc<CrossChainEmitterV2>,
}

impl MemoTracer {
    /// Gera memo a partir de uma Cathedral Action
    pub fn generate_memo(&self, action: &Action) -> [u8; 32] {
        let action_hash = sha2::Sha256::digest(action.canonical_bytes());
        let mut memo = [0u8; 32];
        memo.copy_from_slice(&action_hash[..32]);
        memo
    }

    /// Indexa evento Memo do B20 no EventStore
    pub async fn index_memo_event(
        &self,
        tx_hash: &str,
        log_index: u64,
        caller: Address,
        memo: [u8; 32],
    ) -> Result<(), TracerError> {
        let event = OrchestratorEvent::B20Memo {
            tx_hash: tx_hash.to_string(),
            log_index,
            caller: format!("{:?}", caller),
            memo: hex::encode(memo),
            timestamp: chrono::Utc::now().timestamp(),
        };

        // Armazena localmente
        self.event_store.store(event.clone()).await?;

        // Emite cross-chain
        self.cross_chain_emitter.emit_cross_chain(event).await?;

        Ok(())
    }

    /// Resolve memo para Action original
    pub async fn resolve_memo(&self, memo: [u8; 32]) -> Result<Option<Action>, TracerError> {
        // Busca no EventStore por evento com este memo
        let events = self.event_store.query_by_memo(&hex::encode(memo)).await?;

        if let Some(event) = events.first() {
            if let OrchestratorEvent::ActionProposed { action, .. } = &event.payload {
                return Ok(Some(action.clone()));
            }
        }

        Ok(None)
    }
}
