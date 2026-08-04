//! src/agent/cca_v2.rs
//! CCA 2.0 — integra MoE, Thinking Engine, Spatial Attention, MTP, SAHOO+ e Trinity.

use std::sync::Arc;
use tokenizers::Tokenizer;
use tracing::{info, debug};

use crate::moe::{
    MoeCognitiveOrchestrator, CognitiveContext, CognitiveOutput,
    ReactiveExpert, SymbolicExpert, PlanningExpert,
};
use crate::thinking::ThinkingEngine;
use crate::attention::SpatialAttentionEngine;
use crate::mtp::MultiTokenPredictor;
use crate::sahoo::SahooPlus;
use cathedral_trinity::TrinityCore;
use crate::llm::LlmClient;

use cathedral_eac::SahooConfig;

// ============================================================================
// Configuração
// ============================================================================

#[derive(Clone)]
pub struct CCAConfig {
    pub max_tokens: usize,
    pub temperature: f32,
    pub thinking_depth: usize,
    pub moe_k: usize,
    pub attention_blocks: usize,
    pub mtp_tokens: usize,
    pub enable_rl: bool,
    pub max_history: usize,
}

impl Default for CCAConfig {
    fn default() -> Self {
        Self {
            max_tokens: 4096,
            temperature: 0.7,
            thinking_depth: 5,
            moe_k: 3,
            attention_blocks: 64,
            mtp_tokens: 3,
            enable_rl: false,
            max_history: 100,
        }
    }
}

// ============================================================================
// SessionManager — reutilizado da v13.1
// ============================================================================

pub use cathedral_tools::{SessionManager, AgentMessage};

// ============================================================================
// CCAgentV2
// ============================================================================

pub struct CCAgentV2 {
    moe: MoeCognitiveOrchestrator,
    thinking: tokio::sync::Mutex<ThinkingEngine>,
    _attention: tokio::sync::Mutex<SpatialAttentionEngine>,
    mtp: MultiTokenPredictor,
    sahoo: Arc<SahooPlus>,
    trinity: Arc<TrinityCore>,
    pub session_manager: Arc<SessionManager>,
    _tokenizer: Tokenizer,  // ✅ CSE-HIGH-008
    _config: CCAConfig,
    _llm_client: Arc<dyn LlmClient + Send + Sync>,
}

impl CCAgentV2 {
    pub async fn new(
        config: CCAConfig,
        llm_client: Arc<dyn LlmClient + Send + Sync>,
        trinity: Arc<TrinityCore>,
        session_manager: Arc<SessionManager>,
    ) -> Self {
        // Tokenizer
        let tokenizer = tokenizers::Tokenizer::new(tokenizers::models::bpe::BPE::default());

        // Thinking Engine
        let thinking = ThinkingEngine::new(config.thinking_depth)
            .with_llm_client(llm_client.clone());

        // MoE
        let mut moe = MoeCognitiveOrchestrator::new();
        let reactive = Arc::new(ReactiveExpert::new(llm_client.clone()));
        let symbolic = Arc::new(SymbolicExpert::new(Arc::new(cathedral_trinity::SymbolicEngine::new())));
        let planning = Arc::new(PlanningExpert::new(
            Arc::new(cathedral_trinity::MonteCarloTreeSearch::new()),
            Arc::new(cathedral_trinity::MentalSimulator::new()),
        ));
        moe.register_expert(reactive, 1000);
        moe.register_expert(symbolic, 500);
        moe.register_expert(planning, 800);

        // Spatial Attention
        let attention = SpatialAttentionEngine::new(2048, config.attention_blocks, config.temperature);

        // MTP (draft/verifier placeholders)
        let draft_model = Box::new(crate::mtp::predictor::NgramDraftModel::new());
        let verifier = Box::new(crate::mtp::predictor::VerifierImpl::new());
        let mtp = MultiTokenPredictor::new(draft_model, verifier, config.mtp_tokens, tokenizer.clone());

        // SAHOO+
        let sahoo_config = SahooConfig::default();
        let sahoo = Arc::new(SahooPlus::new(sahoo_config));

        Self {
            moe,
            thinking: tokio::sync::Mutex::new(thinking),
            _attention: tokio::sync::Mutex::new(attention),
            mtp,
            sahoo,
            trinity,
            session_manager,
            _tokenizer: tokenizer,
            _config: config,
            _llm_client: llm_client,
        }
    }

    /// Processa uma requisição do utilizador — fluxo completo
    pub async fn process(&self, user_input: &str, session_id: &str) -> Result<String, String> {
        debug!("📥 CCA v2: processando '{}' na sessão {}", user_input, session_id);

        let session = self.session_manager.get_session(session_id).await
            .ok_or_else(|| format!("Sessão não encontrada: {}", session_id))?;

        // 1. Thinking Engine
        let mut thinking_guard = self.thinking.lock().await;
        let _thoughts = thinking_guard.reason(user_input, 3).await?;
        let thinking_trace = thinking_guard.get_thinking_trace().to_vec();
        drop(thinking_guard);

        // 2. Contexto cognitivo
        let mut ctx = CognitiveContext::new(user_input)
            .with_consciousness(self.trinity.get_consciousness().await)
            .with_thinking_trace(thinking_trace);
        ctx.history = session.history;
        ctx.available_tools = self.get_available_tools();
        ctx.constraints = self.get_constraints();

        // 3. MoE
        let outputs = self.moe.route_and_process(&ctx).await?;

        // 4. Combina outputs
        let combined = self.combine_outputs(outputs, &ctx);

        // 5. Geração final com MTP (tokenização real)
        let tokens = self.mtp.tokenize(&combined);
        let predicted_tokens = self.mtp.predict(&tokens).await?;
        let final_response = self.mtp.detokenize(&predicted_tokens);

        // 6. SAHOO+
        self.sahoo.check_alignment_with_context(user_input, &final_response, &ctx).await?;

        // 7. Hot reload se for código Trinity
        if self.detect_trinity_code(&final_response) {
            let code = self.extract_rust_code(&final_response);
            self.trinity.submit_code_snippet(&code).await?;
        }

        // 8. Persistir histórico
        self.session_manager.append_message(session_id, AgentMessage {
            role: "assistant".to_string(),
            content: final_response.clone(),
            timestamp: chrono::Utc::now(),
        }).await;

        info!("✅ CCA v2: resposta gerada ({} chars)", final_response.len());
        Ok(final_response)
    }

    fn combine_outputs(&self, outputs: Vec<CognitiveOutput>, ctx: &CognitiveContext) -> String {
        let mut combined = String::new();
        if let Some(ref thoughts) = ctx.thinking_trace {
            combined.push_str("Raciocínio:\n");
            for thought in thoughts {
                combined.push_str(&format!("- {}\n", thought.content));
            }
            combined.push_str("\n");
        }
        for output in outputs {
            combined.push_str(&format!("[{}] {}\n", output.source_expert, output.content));
        }
        combined
    }

    fn detect_trinity_code(&self, text: &str) -> bool {
        text.contains("trinity") || text.contains("Trinity") || text.contains("SAHOO")
    }

    fn extract_rust_code(&self, text: &str) -> String {
        let re = regex::Regex::new(r"```rust\s*\n([\s\S]*?)\n```").unwrap();
        re.captures(text)
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default()
    }

    fn get_available_tools(&self) -> Vec<String> {
        vec![
            "write_file".to_string(),
            "read_file".to_string(),
            "exec_command".to_string(),
            "run_dev_server".to_string(),
            "install_dependency".to_string(),
            "scaffold_nextjs".to_string(),
        ]
    }

    fn get_constraints(&self) -> Vec<String> {
        vec![
            "no_unsafe".to_string(),
            "no_system_commands".to_string(),
            "no_file_deletion".to_string(),
        ]
    }
}
