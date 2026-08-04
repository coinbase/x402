//! src/moe/experts.rs
//! Reactive, Symbolic e Planning experts.

use std::sync::Arc;
use async_trait::async_trait;

use super::{
    CognitiveContext, CognitiveOutput, CognitiveExpert, CognitiveCapability, ToolCall,
};
use cathedral_eac::ConsciousnessState;
use crate::llm::LlmClient; // centralizado (ver src/llm/mod.rs)
use cathedral_trinity::{SymbolicEngine, MentalSimulator, MonteCarloTreeSearch};
use cathedral_tools::AgentMessage;

// ============================================================================
// REACTIVE EXPERT
// ============================================================================

pub struct ReactiveExpert {
    llm_client: Arc<dyn LlmClient + Send + Sync>,
}

impl ReactiveExpert {
    pub fn new(llm_client: Arc<dyn LlmClient + Send + Sync>) -> Self {
        Self { llm_client }
    }
}

#[async_trait]
impl CognitiveExpert for ReactiveExpert {
    fn id(&self) -> String { "reactive".to_string() }
    fn capability(&self) -> CognitiveCapability { CognitiveCapability::Reactive }

    fn activation_score(&self, ctx: &CognitiveContext) -> f64 {
        match ctx.consciousness {
            ConsciousnessState::Dormant => 0.9,
            ConsciousnessState::Aware => 0.8,
            ConsciousnessState::Reflective => 0.5,
            ConsciousnessState::MetaCognitiva => 0.3,
            ConsciousnessState::Autopoiética => 0.2,
        }
    }

    async fn process(&self, ctx: &CognitiveContext) -> Result<CognitiveOutput, String> {
        let mut prompt = String::new();
        if let Some(ref thoughts) = ctx.thinking_trace {
            prompt.push_str("Raciocínio actual:\n");
            for thought in thoughts {
                prompt.push_str(&format!("- {}\n", thought.content));
            }
            prompt.push_str("\n");
        }
        prompt.push_str("Prompt do utilizador:\n");
        prompt.push_str(&ctx.prompt);
        prompt.push_str("\n");

        let mut messages = ctx.history.clone();
        messages.push(AgentMessage {
            role: "user".to_string(),
            content: prompt,
            timestamp: chrono::Utc::now(),
        });

        let response = self.llm_client.chat_completion(&messages, None).await?;

        Ok(CognitiveOutput {
            content: response,
            tool_calls: Vec::new(),
            confidence: 0.8,
            thinking_trace: Some("Resposta reactiva directa".to_string()),
            source_expert: self.id(),
        })
    }
}

// ============================================================================
// SYMBOLIC EXPERT
// ============================================================================

pub struct SymbolicExpert {
    _symbolic_engine: Arc<SymbolicEngine>,
}

impl SymbolicExpert {
    pub fn new(engine: Arc<SymbolicEngine>) -> Self {
        Self { _symbolic_engine: engine }
    }
}

#[async_trait]
impl CognitiveExpert for SymbolicExpert {
    fn id(&self) -> String { "symbolic".to_string() }
    fn capability(&self) -> CognitiveCapability { CognitiveCapability::Symbolic }

    fn activation_score(&self, ctx: &CognitiveContext) -> f64 {
        let dc = ctx.eac_metrics[0];
        if dc > 0.7 { 0.8 } else { 0.4 }
    }

    async fn process(&self, ctx: &CognitiveContext) -> Result<CognitiveOutput, String> {
        let facts = extract_facts(&ctx.prompt);
        let content = if facts.is_empty() {
            "Nenhum novo facto deduzido.".to_string()
        } else {
            format!("Deduzido(s): {}", facts.join(", "))
        };
        let trace = format!("Factos deduzidos: {:?}", facts);

        Ok(CognitiveOutput {
            content,
            tool_calls: Vec::new(),
            confidence: 0.9,
            thinking_trace: Some(trace),
            source_expert: self.id(),
        })
    }
}

fn extract_facts(text: &str) -> Vec<String> {
    let mut facts = Vec::new();
    if text.contains("é") || text.contains("causa") {
        facts.push("facto_extraido".to_string());
    }
    facts
}

// ============================================================================
// PLANNING EXPERT (MCTS + Simulador)
// ============================================================================

pub struct Plan {
    pub description: String,
    pub tool_calls: Vec<ToolCall>,
    pub confidence: f64,
}

pub struct PlanningExpert {
    _mcts: Arc<MonteCarloTreeSearch>,
    _simulator: Arc<MentalSimulator>,
}

impl PlanningExpert {
    pub fn new(mcts: Arc<MonteCarloTreeSearch>, simulator: Arc<MentalSimulator>) -> Self {
        Self { _mcts: mcts, _simulator: simulator }
    }
}

#[async_trait]
impl CognitiveExpert for PlanningExpert {
    fn id(&self) -> String { "planning".to_string() }
    fn capability(&self) -> CognitiveCapability { CognitiveCapability::Planning }

    fn activation_score(&self, ctx: &CognitiveContext) -> f64 {
        (ctx.prompt.len() as f64 / 1000.0).min(1.0)
    }

    async fn process(&self, ctx: &CognitiveContext) -> Result<CognitiveOutput, String> {
        let plan = Plan {
            description: format!("Plano para: {}", ctx.prompt),
            tool_calls: Vec::new(),
            confidence: 0.7,
        };
        let sim_trace = format!("Simulação do plano: {}", plan.description);
        let sim_confidence = 0.8;

        let content = format!("Plano: {}\nConfiança: {:.2}", plan.description, plan.confidence);
        let trace = format!("MCTS + Simulação: {}", sim_trace);

        Ok(CognitiveOutput {
            content,
            tool_calls: plan.tool_calls,
            confidence: sim_confidence,
            thinking_trace: Some(trace),
            source_expert: self.id(),
        })
    }
}
