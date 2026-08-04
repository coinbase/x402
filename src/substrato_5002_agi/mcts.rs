//! src/substrato_5002_agi/mcts.rs
//! Monte Carlo Tree Search com verificação de passos
//! Selo: CATHEDRAL-ARKHE-AGI-MCTS-v3.0.0-2026-06-19

use crate::substrato_5002_agi::world_model::WorldState;
use crate::substrato_5002_agi::ethics::{EthicsResult, EthicsVerifier};
use rand::Rng;
use std::collections::HashMap;
use std::sync::Arc;

/// Nó da árvore MCTS
#[derive(Debug, Clone)]
pub struct MCTSNode {
    pub id: u64,
    pub parent_id: Option<u64>,
    pub state: WorldState,
    pub action: Option<String>,      // passo de raciocínio
    pub visits: u32,
    pub value: f32,                  // recompensa acumulada
    pub ethics: Option<EthicsResult>,
    pub children: Vec<u64>,
    pub untried_actions: Vec<String>,
    pub expanded: bool,
    pub step_verified: bool,         // verificação do passo
}

/// Resultado do MCTS
#[derive(Debug, Clone)]
pub struct MCTSResult {
    pub best_path: Vec<MCTSNode>,
    pub total_value: f32,
    pub nodes_explored: usize,
    pub max_depth: usize,
    pub verification_passed: bool,
}

pub struct MCTSEngine {
    exploration_constant: f32,       // C (UCB1)
    max_iterations: usize,
    max_depth: usize,
    ethics_verifier: Arc<EthicsVerifier>,
}

impl MCTSEngine {
    pub fn new(exploration_constant: f32, max_iterations: usize, max_depth: usize, ethics: Arc<EthicsVerifier>) -> Self {
        Self { exploration_constant, max_iterations, max_depth, ethics_verifier: ethics }
    }

    /// Executa MCTS a partir de um estado inicial
    pub async fn search(
        &self,
        initial_state: &WorldState,
        abstraction: &str,
        _uncertainty: f32,
    ) -> anyhow::Result<MCTSResult> {
        let root = MCTSNode {
            id: 0,
            parent_id: None,
            state: initial_state.clone(),
            action: None,
            visits: 0,
            value: 0.0,
            ethics: None,
            children: Vec::new(),
            untried_actions: self.generate_actions(abstraction),
            expanded: false,
            step_verified: false,
        };

        let mut tree = HashMap::new();
        tree.insert(0, root);
        let mut node_count = 1;

        for _ in 0..self.max_iterations {
            // 1. Selection: percorre árvore usando UCB1
            let mut current_id = 0;
            let mut path = Vec::new();
            while let Some(node) = tree.get(&current_id) {
                path.push(current_id);
                if node.expanded && !node.children.is_empty() {
                    // Escolhe filho com maior UCB1
                    current_id = self.select_best_child(&tree, current_id)?;
                } else {
                    break;
                }
            }

            // 2. Expansion: se o nó atual tem ações não testadas, expande
            let mut new_child = None;
            if let Some(node) = tree.get_mut(&current_id) {
                if !node.untried_actions.is_empty() {
                    let action = node.untried_actions.pop().unwrap();
                    let new_id = node_count;
                    node_count += 1;
                    let child_state = self.simulate_action(&node.state, &action)?;
                    let ethics = self.ethics_verifier.verify_step(&action, &child_state)?;
                    let child = MCTSNode {
                        id: new_id,
                        parent_id: Some(current_id),
                        state: child_state,
                        action: Some(action),
                        visits: 0,
                        value: 0.0,
                        ethics: Some(ethics.clone()),
                        children: Vec::new(),
                        untried_actions: self.generate_actions(abstraction),
                        expanded: false,
                        step_verified: ethics.passed,
                    };
                    // Add child id to parent
                    node.children.push(new_id);
                    new_child = Some((new_id, child));
                } else {
                    node.expanded = true;
                }
            }
            if let Some((new_id, child)) = new_child {
                tree.insert(new_id, child);
                current_id = new_id;
                path.push(current_id);
            }

            // 3. Simulation: rollout até profundidade máxima
            let mut reward = 0.0;
            let mut depth = 0;
            let mut current_state = tree.get(&current_id).unwrap().state.clone();
            while depth < self.max_depth {
                let action = self.rollout_action(&current_state)?;
                let (next_state, step_reward) = self.simulate_step(&current_state, &action)?;
                reward += step_reward;
                current_state = next_state;
                depth += 1;
            }

            // 4. Backpropagation: atualiza valores ao longo do caminho
            for &node_id in path.iter().rev() {
                if let Some(node) = tree.get_mut(&node_id) {
                    node.visits += 1;
                    node.value += reward / (depth as f32);
                }
            }
        }

        // Extrai melhor caminho
        let best_path = self.extract_best_path(&tree)?;
        let total_value = if best_path.is_empty() { 0.0 } else { best_path.iter().map(|n| n.value).sum::<f32>() / best_path.len() as f32 };
        let verification_passed = best_path.iter().all(|n| n.step_verified);

        Ok(MCTSResult {
            best_path,
            total_value,
            nodes_explored: node_count as usize,
            max_depth: self.max_depth,
            verification_passed,
        })
    }

    /// Gera ações possíveis a partir de uma abstração
    fn generate_actions(&self, abstraction: &str) -> Vec<String> {
        // Simulação: divide a abstração em frases potenciais
        abstraction.split('.').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
    }

    /// Simula o efeito de uma ação no estado (world model)
    fn simulate_action(&self, state: &WorldState, action: &str) -> anyhow::Result<WorldState> {
        let mut new_state = state.clone();
        // Atualiza previsões baseado na ação
        new_state.predicted_future.push(action.to_string());
        new_state.uncertainty *= 0.9; // ação reduz incerteza
        Ok(new_state)
    }

    /// Rollout: ação aleatória para simulação
    fn rollout_action(&self, _state: &WorldState) -> anyhow::Result<String> {
        let possible = vec!["aprofundar".to_string(), "concluir".to_string(), "questionar".to_string()];
        let mut rng = rand::thread_rng();
        let idx = rng.gen_range(0..possible.len());
        Ok(possible[idx].clone())
    }

    /// Simula um passo do rollout, retornando novo estado e recompensa
    fn simulate_step(&self, state: &WorldState, action: &str) -> anyhow::Result<(WorldState, f32)> {
        let mut new_state = state.clone();
        new_state.predicted_future.push(action.to_string());
        let reward = match action {
            "aprofundar" => 0.5,
            "concluir" => 1.0,
            "questionar" => 0.3,
            _ => 0.0,
        };
        Ok((new_state, reward))
    }

    /// Seleciona o filho com maior UCB1
    fn select_best_child(&self, tree: &HashMap<u64, MCTSNode>, parent_id: u64) -> anyhow::Result<u64> {
        let parent = tree.get(&parent_id).unwrap();
        let total_visits = parent.visits as f32;
        let mut best_child_id = parent_id;
        let mut best_ucb = -f32::INFINITY;
        for child_id in &parent.children {
            let child = tree.get(child_id).unwrap();
            let exploitation = child.value / (child.visits as f32 + 1e-6);
            let exploration = self.exploration_constant * (total_visits.ln() / (child.visits as f32 + 1e-6)).sqrt();
            let ucb = exploitation + exploration;
            if ucb > best_ucb {
                best_ucb = ucb;
                best_child_id = *child_id;
            }
        }
        Ok(best_child_id)
    }

    /// Extrai o caminho com maior valor acumulado
    fn extract_best_path(&self, tree: &HashMap<u64, MCTSNode>) -> anyhow::Result<Vec<MCTSNode>> {
        let mut path = Vec::new();
        let mut current_id = 0;
        while let Some(node) = tree.get(&current_id) {
            path.push(node.clone());
            if node.children.is_empty() { break; }
            // Escolhe filho com maior valor acumulado
            let mut best_child_id = current_id;
            let mut best_value = -f32::INFINITY;
            for &child_id in &node.children {
                let child = tree.get(&child_id).unwrap();
                if child.value > best_value {
                    best_value = child.value;
                    best_child_id = child_id;
                }
            }
            if best_child_id == current_id { break; }
            current_id = best_child_id;
        }
        Ok(path)
    }
}
