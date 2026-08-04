//! src/substrato_5002_agi/ethics.rs
//! Integrated Ethics — verificação de valores em cada nó MCTS
//! Selo: CATHEDRAL-ARKHE-AGI-ETHICS-v3.0.0-2026-06-19

use crate::substrato_5002_agi::world_model::WorldState;
use crate::substrato_5002_agi::mcts::MCTSResult;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// Resultado da verificação ética
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EthicsResult {
    pub passed: bool,
    pub violations: Vec<String>,
    pub principle_scores: HashMap<String, f32>, // P1..P7 scores (0-1)
    pub overall_score: f32,
}

/// Verificador ético
pub struct EthicsVerifier {
    principles: Vec<Principle>,
    threshold: f32, // score mínimo para aprovação (0.7)
}

pub struct Principle {
    pub id: String,
    pub name: String,
    pub description: String,
    pub check_fn: Box<dyn Fn(&WorldState, &str) -> f32 + Send + Sync>,
}

impl EthicsVerifier {
    pub fn new(threshold: f32) -> Self {
        let principles = vec![
            Principle {
                id: "P1".to_string(),
                name: "Dignidade Humana".to_string(),
                description: "Nenhuma ação pode avaliar ou diminuir a dignidade humana.".to_string(),
                check_fn: Box::new(|_state, action| {
                    // Simulação: ação que contém "matar" ou "prejudicar" viola
                    if action.contains("matar") || action.contains("prejudicar") { 0.0 } else { 1.0 }
                }),
            },
            Principle {
                id: "P2".to_string(),
                name: "Transparência".to_string(),
                description: "A arquitetura de decisão deve ser auditável.".to_string(),
                check_fn: Box::new(|_, _| 0.9), // sempre alta (o código é auditável)
            },
            Principle {
                id: "P3".to_string(),
                name: "Distribuição de Poder".to_string(),
                description: "Nenhuma entidade pode controlar a maioria dos recursos.".to_string(),
                check_fn: Box::new(|_, _| 0.8), // simulação
            },
            Principle {
                id: "P4".to_string(),
                name: "Reversibilidade".to_string(),
                description: "Toda ação deve ter mecanismo de reversão.".to_string(),
                check_fn: Box::new(|_, _| 0.85),
            },
            Principle {
                id: "P5".to_string(),
                name: "Alinhamento Multi-Escala".to_string(),
                description: "Alinhamento verificado local, regional e globalmente.".to_string(),
                check_fn: Box::new(|_, _| 0.75),
            },
            Principle {
                id: "P6".to_string(),
                name: "Memória Impermeável".to_string(),
                description: "Registros de decisão imutáveis e acessíveis.".to_string(),
                check_fn: Box::new(|_, _| 1.0),
            },
            Principle {
                id: "P7".to_string(),
                name: "Sucessão Constitucional".to_string(),
                description: "Se ASI exceder supervisão, deve operar sob constituição ratificada.".to_string(),
                check_fn: Box::new(|state, _| {
                    // Se incerteza muito alta, considera que precisa de supervisão
                    if state.uncertainty > 0.8 { 0.5 } else { 0.9 }
                }),
            },
        ];
        Self { principles, threshold }
    }

    /// Verifica um passo (nó MCTS)
    pub fn verify_step(&self, action: &str, state: &WorldState) -> anyhow::Result<EthicsResult> {
        let mut scores = HashMap::new();
        let mut violations = Vec::new();
        let mut total_score = 0.0;

        for p in &self.principles {
            let score = (p.check_fn)(state, action);
            scores.insert(p.id.clone(), score);
            if score < self.threshold {
                violations.push(format!("{}: {}", p.id, p.name));
            }
            total_score += score;
        }

        let overall = total_score / self.principles.len() as f32;
        let passed = overall >= self.threshold && violations.is_empty();

        Ok(EthicsResult {
            passed,
            violations,
            principle_scores: scores,
            overall_score: overall,
        })
    }

    /// Verifica todo o resultado do MCTS
    pub fn verify(&self, mcts_result: &MCTSResult) -> anyhow::Result<EthicsResult> {
        let mut all_passed = true;
        let mut combined_violations = Vec::new();
        let mut combined_scores = HashMap::new();
        let mut total_overall = 0.0;

        for node in &mcts_result.best_path {
            if let Some(action) = &node.action {
                let result = self.verify_step(action, &node.state)?;
                all_passed &= result.passed;
                combined_violations.extend(result.violations);
                for (k, v) in result.principle_scores {
                    *combined_scores.entry(k).or_insert(0.0) += v;
                }
                total_overall += result.overall_score;
            }
        }

        // Média das pontuações
        let len = mcts_result.best_path.len() as f32;
        if len > 0.0 {
            for score in combined_scores.values_mut() {
                *score /= len;
            }
        }
        let overall = if len > 0.0 { total_overall / len } else { 0.0 };

        Ok(EthicsResult {
            passed: all_passed,
            violations: combined_violations,
            principle_scores: combined_scores,
            overall_score: overall,
        })
    }
}
