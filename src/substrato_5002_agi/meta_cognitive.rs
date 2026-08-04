//! src/substrato_5002_agi/meta_cognitive.rs
//! Meta-Cognitive Loop — RSSM v2.0 para auto-modelagem
//! Selo: CATHEDRAL-ARKHE-AGI-META-v3.0.0-2026-06-19

use crate::substrato_5002_agi::world_model::WorldState;
use crate::substrato_5002_agi::mcts::MCTSResult;
use crate::substrato_5002_agi::ethics::EthicsResult;
use std::collections::VecDeque;
use serde::{Serialize, Deserialize};

/// Representação do estado meta-cognitivo (crenças sobre si)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetaState {
    pub confidence: f32,            // auto-confiança (0-1)
    pub uncertainty_epistemic: f32, // incerteza epistêmica (falta de conhecimento)
    pub uncertainty_aleatoric: f32, // incerteza aleatória (ruído)
    pub goal_achievement: f32,      // progresso em direção ao objetivo
    pub self_corrections_count: u32,
    pub last_ethics_violation: bool,
}

/// Loop meta-cognitivo (RSSM v2.0 simplificado)
pub struct MetaCognitiveLoop {
    state: MetaState,
    history: VecDeque<MetaState>,
    horizon: usize,
    // Modelo de transição de estados meta (RSSM)
    transition_model: MetaTransitionModel,
}

#[derive(Debug, Clone)]
pub struct MetaTransitionModel {
    // Pequena rede neural (MLP) para predizer próximo estado meta
    // Simulada com regras heurísticas
}

impl MetaCognitiveLoop {
    pub fn new(horizon: usize) -> Self {
        Self {
            state: MetaState {
                confidence: 0.7,
                uncertainty_epistemic: 0.3,
                uncertainty_aleatoric: 0.2,
                goal_achievement: 0.0,
                self_corrections_count: 0,
                last_ethics_violation: false,
            },
            history: VecDeque::with_capacity(horizon),
            horizon,
            transition_model: MetaTransitionModel {},
        }
    }

    /// Atualiza o estado meta com base na interação
    pub fn update(&mut self, world_state: &WorldState, mcts: &MCTSResult, ethics: &EthicsResult) -> anyhow::Result<()> {
        // 1. Atualiza confiança com base no sucesso do MCTS
        let confidence_delta = (mcts.total_value - 0.5) * 0.2;
        self.state.confidence = (self.state.confidence + confidence_delta).clamp(0.0, 1.0);

        // 2. Incerteza epistêmica: baseada na diversidade de nós explorados
        let epistemic = 1.0 - (mcts.nodes_explored as f32 / (self.horizon * 2) as f32).min(1.0);
        self.state.uncertainty_epistemic = epistemic;

        // 3. Incerteza aleatória: baseada na incerteza do world state
        self.state.uncertainty_aleatoric = world_state.uncertainty;

        // 4. Progresso: baseado nos passos do MCTS
        self.state.goal_achievement = (mcts.best_path.len() as f32 / self.horizon as f32).min(1.0);

        // 5. Verificação ética
        self.state.last_ethics_violation = !ethics.passed;
        if !ethics.passed {
            self.state.self_corrections_count += 1;
        }

        // 6. Armazena histórico
        self.history.push_back(self.state.clone());
        if self.history.len() > self.horizon {
            self.history.pop_front();
        }

        Ok(())
    }

    /// Prediz a incerteza futura usando o modelo de transição
    pub fn predict_uncertainty(&self, steps: usize) -> Vec<f32> {
        let mut preds = Vec::new();
        let mut current = self.state.clone();
        for _ in 0..steps {
            let delta = self.transition_model.predict_delta(&current);
            current.uncertainty_epistemic = (current.uncertainty_epistemic + delta.0).clamp(0.0, 1.0);
            current.uncertainty_aleatoric = (current.uncertainty_aleatoric + delta.1).clamp(0.0, 1.0);
            preds.push((current.uncertainty_epistemic + current.uncertainty_aleatoric) / 2.0);
        }
        preds
    }

    pub fn current_uncertainty(&self) -> f32 {
        (self.state.uncertainty_epistemic + self.state.uncertainty_aleatoric) / 2.0
    }

    pub fn current_state(&self) -> &MetaState {
        &self.state
    }

    pub fn history(&self) -> &VecDeque<MetaState> {
        &self.history
    }
}

// Modelo de transição (simplificado)
impl MetaTransitionModel {
    fn predict_delta(&self, state: &MetaState) -> (f32, f32) {
        // Simulação: incerteza diminui com confiança
        let epistemic_delta = -0.02 * state.confidence;
        let aleatoric_delta = -0.01 * state.goal_achievement;
        (epistemic_delta, aleatoric_delta)
    }
}
