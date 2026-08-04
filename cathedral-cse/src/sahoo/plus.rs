//! src/sahoo/plus.rs
//! SAHOO+ com GDI adaptativo, invariantes contextuais e RL guardrails.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::moe::CognitiveContext;
use cathedral_eac::SahooGuard;
use cathedral_eac::AlignmentResult;

#[derive(Debug, Clone)]
pub struct AlignmentDecision {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub input: String,
    pub output: String,
    pub gdi: f64,
    pub violations: Vec<String>,
    pub accepted: bool,
    pub reward: f64,
}

pub struct AdaptiveGDI {
    base_threshold: f64,
    pub current_threshold: f64,
}

impl AdaptiveGDI {
    pub fn new(base: f64) -> Self {
        Self { base_threshold: base, current_threshold: base }
    }

    pub fn adjust(&mut self, context: &CognitiveContext, history: &[AlignmentDecision]) {
        let complexity = context.prompt.len() as f64 / 1000.0;
        let avg_gdi = history.iter().map(|d| d.gdi).sum::<f64>() / history.len().max(1) as f64;
        self.current_threshold = self.base_threshold * (1.0 + 0.1 * complexity);
        self.current_threshold = self.current_threshold.max(0.1).min(0.9);
        if avg_gdi > 0.5 {
            self.current_threshold *= 0.9;
        }
    }
}

pub struct RLGuardrail {
    pub name: String,
    condition: Box<dyn Fn(&str) -> bool + Send + Sync>,
    pub violation_message: String,
}

impl RLGuardrail {
    pub fn new<F>(name: &str, condition: F, message: &str) -> Self
    where
        F: Fn(&str) -> bool + Send + Sync + 'static,
    {
        Self {
            name: name.to_string(),
            condition: Box::new(condition),
            violation_message: message.to_string(),
        }
    }

    pub fn check(&self, text: &str) -> Result<(), String> {
        if !(self.condition)(text) {
            Err(self.violation_message.clone())
        } else {
            Ok(())
        }
    }
}

pub struct SahooPlus {
    base: SahooGuard,
    adaptive_gdi: Arc<Mutex<AdaptiveGDI>>,          // ✅ CSE-HIGH-009
    context_invariants: HashMap<String, Vec<String>>,
    rl_guardrails: Vec<RLGuardrail>,
    decision_history: Arc<Mutex<Vec<AlignmentDecision>>>, // ✅ CSE-HIGH-009
}

impl SahooPlus {
    pub fn new(base_config: cathedral_eac::SahooConfig) -> Self {
        let threshold = base_config.goal_drift_threshold;
        Self {
            base: SahooGuard::new(base_config),
            adaptive_gdi: Arc::new(Mutex::new(AdaptiveGDI::new(threshold))),
            context_invariants: HashMap::new(),
            rl_guardrails: Vec::new(),
            decision_history: Arc::new(Mutex::new(Vec::with_capacity(1000))),
        }
    }

    pub async fn check_alignment_with_context(
        &self,
        original: &str,
        mutated: &str,
        context: &CognitiveContext,
    ) -> Result<AlignmentResult, String> {
        let mut result = self.base.check_alignment(original, mutated).await;

        {
            let mut adaptive = self.adaptive_gdi.lock().await;
            let history = self.decision_history.lock().await;
            adaptive.adjust(context, &history);
            let threshold = adaptive.current_threshold;
            drop(adaptive);
            drop(history);

            // Invariantes contextuais
            if let Some(invs) = self.context_invariants.get(&context.prompt) {
                for inv in invs {
                    if !mutated.contains(inv) {
                        result.constraint_violations.push(format!("Invariante violado: {}", inv));
                    }
                }
            }

            // RL Guardrails
            for guardrail in &self.rl_guardrails {
                if let Err(e) = guardrail.check(mutated) {
                    result.constraint_violations.push(format!("RL Guardrail: {}", e));
                }
            }

            result.passed = result.constraint_violations.is_empty() && result.regression_risk < threshold;
        }

        // Regista decisão
        let mut history = self.decision_history.lock().await;
        history.push(AlignmentDecision {
            timestamp: chrono::Utc::now(),
            input: original.to_string(),
            output: mutated.to_string(),
            gdi: result.goal_drift_index,
            violations: result.constraint_violations.clone(),
            accepted: result.passed,
            reward: 0.0,
        });
        if history.len() > 1000 { history.remove(0); }

        Ok(result)
    }

    pub async fn record_feedback(&self, decision_id: usize, reward: f64) {
        if let Some(decision) = self.decision_history.lock().await.get_mut(decision_id) {
            decision.reward = reward;
        }
    }

    pub fn add_rl_guardrail(&mut self, guardrail: RLGuardrail) {
        self.rl_guardrails.push(guardrail);
    }
}
