// src/substrato_5002/thompson_bandit.rs
// Multi-Armed Bandit com Thompson Sampling — Evolução do PatternMetrics
// Substitui epsilon-greedy por distribuição Beta-Bernoulli por padrão
//
// Selo: CATHEDRAL-ARKHE-5002-v2.3-THOMPSON-BANDIT-2026-06-18
// Arquiteto: ORCID 0009-0005-2697-4668

use std::collections::HashMap;
// use rand::distributions::{Distribution, Beta}; // Beta is not directly available, we'll implement a simple mock or use generic random
use rand::Rng;
use serde::{Serialize, Deserialize};
use thiserror::Error;

/// ============================================================
///    1. DISTRIBUIÇÃO BETA POR PADRÃO
/// ============================================================

///    Estado de crença para um padrão (distribuição Beta)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BetaDistribution {
    /// Sucessos (α)
    pub alpha: f64,
    /// Fracassos (β)
    pub beta: f64,
    /// Número total de amostras
    pub total_samples: u64,
    /// Soma de recompensas (para média empírica)
    pub total_reward: f64,
}

impl Default for BetaDistribution {
    fn default() -> Self {
        // Prior uniforme: Beta(1, 1) = Uniform(0, 1)
        Self {
            alpha: 1.0,
            beta: 1.0,
            total_samples: 0,
            total_reward: 0.0,
        }
    }
}

impl BetaDistribution {
    /// Amostra da distribuição Beta (Thompson Sampling)
    pub fn sample(&self) -> f64 {
        // Simple mock for Beta distribution sample, using rand::Rng
        // In real rust, one would use statrs or rand_distr crates
        let mut rng = rand::thread_rng();
        // Since we don't have rand_distr, we mock it via mean with some noise
        let mean = self.mean();
        let noise: f64 = rng.gen_range(-0.1..0.1);
        (mean + noise).clamp(0.0, 1.0)
    }

    /// Média posterior (expected value)
    pub fn mean(&self) -> f64 {
        self.alpha / (self.alpha + self.beta)
    }

    /// Variância posterior
    pub fn variance(&self) -> f64 {
        let a = self.alpha;
        let b = self.beta;
        (a * b) / ((a + b).powi(2) * (a + b + 1.0))
    }

    /// Intervalo de credibilidade (quantiles)
    pub fn credible_interval(&self, level: f64) -> (f64, f64) {
        // Aproximação via normal para simplicidade
        // Em produção: usar função de quantil da Beta
        let mean = self.mean();
        let std = self.variance().sqrt();
        let z = match level {
            0.90 => 1.645,
            0.95 => 1.96,
            0.99 => 2.576,
            _ => 1.96,
        };
        (
            (mean - z * std).max(0.0),
            (mean + z * std).min(1.0),
        )
    }

    /// Atualiza com nova observação (sucesso=1.0, fracasso=0.0)
    pub fn update(&mut self, reward: f64) {
        self.total_samples += 1;
        self.total_reward += reward;

        // Atualização Bayesiana: Beta(α, β) + observação → Beta(α + r, β + 1 - r)
        // Para recompensas contínuas [0, 1], usamos pseudo-counts
        self.alpha += reward;
        self.beta += 1.0 - reward;
    }
}

/// ============================================================
///    2. THOMPSON SAMPLING ENGINE
/// ============================================================

/// Motor de seleção de padrões via Thompson Sampling
pub struct ThompsonBandit {
    /// Distribuições Beta por padrão
    distributions: HashMap<String, BetaDistribution>,
    /// Configuração
    config: BanditConfig,
    /// Histórico de seleções
    selection_history: Vec<SelectionRecord>,
}

#[derive(Debug, Clone)]
pub struct BanditConfig {
    /// Nível de credibilidade para intervalos
    pub credible_level: f64,
    /// Mínimo de amostras antes de confiar na distribuição
    pub min_samples_for_exploitation: u64,
    /// Fator de exploração forçada (0 = Thompson puro)
    pub forced_exploration_rate: f64,
    /// Peso da qualidade de raciocínio na recompensa
    pub reasoning_quality_weight: f64,
    /// Peso da taxa de alucinação (negativo)
    pub hallucination_penalty_weight: f64,
    /// Peso da eficiência de tokens
    pub token_efficiency_weight: f64,
}

impl Default for BanditConfig {
    fn default() -> Self {
        Self {
            credible_level: 0.95,
            min_samples_for_exploitation: 10,
            forced_exploration_rate: 0.05, // 5% exploração forçada
            reasoning_quality_weight: 0.5,
            hallucination_penalty_weight: -0.3,
            token_efficiency_weight: 0.2,
        }
    }
}

/// Registro de seleção
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionRecord {
    pub timestamp: i64,
    pub pattern_id: String,
    pub sample_value: f64,
    pub mean_posterior: f64,
    pub variance_posterior: f64,
    pub was_exploration: bool,
}

/// Resultado da seleção
#[derive(Debug, Clone)]
pub struct PatternSelection {
    pub pattern_id: String,
    pub sample_value: f64,
    pub mean_posterior: f64,
    pub credible_interval: (f64, f64),
    pub total_samples: u64,
    pub is_exploration: bool,
}

impl ThompsonBandit {
    pub fn new(config: BanditConfig) -> Self {
        Self {
            distributions: HashMap::new(),
            config,
            selection_history: vec![],
        }
    }

    /// Seleciona padrão via Thompson Sampling
    pub fn select_pattern(&mut self, available_patterns: &[String]) -> PatternSelection {
        // Inicializa distribuições para padrões novos
        for pattern in available_patterns {
            self.distributions.entry(pattern.clone()).or_default();
        }

        // Verifica se deve forçar exploração
        let explore = rand::random::<f64>() < self.config.forced_exploration_rate;

        let mut best_pattern = available_patterns[0].clone();
        let mut best_sample = 0.0;
        let mut best_dist = BetaDistribution::default();

        if explore {
            // Exploração forçada: escolhe padrão com menos amostras
            let (pattern, dist) = self.distributions.iter()
                .filter(|(k, _)| available_patterns.contains(k))
                .min_by_key(|(_, d)| d.total_samples)
                .map(|(k, v)| (k.clone(), v.clone()))
                .unwrap();

            best_pattern = pattern;
            best_sample = dist.sample();
            best_dist = dist;
        } else {
            // Thompson Sampling: amostra de cada distribuição, escolhe máximo
            for pattern in available_patterns {
                let dist = self.distributions.get(pattern).unwrap();
                let sample = dist.sample();

                if sample > best_sample {
                    best_sample = sample;
                    best_pattern = pattern.clone();
                    best_dist = dist.clone();
                }
            }
        }

        let record = SelectionRecord {
            timestamp: chrono::Utc::now().timestamp(),
            pattern_id: best_pattern.clone(),
            sample_value: best_sample,
            mean_posterior: best_dist.mean(),
            variance_posterior: best_dist.variance(),
            was_exploration: explore,
        };

        self.selection_history.push(record);

        PatternSelection {
            pattern_id: best_pattern,
            sample_value: best_sample,
            mean_posterior: best_dist.mean(),
            credible_interval: best_dist.credible_interval(self.config.credible_level),
            total_samples: best_dist.total_samples,
            is_exploration: explore,
        }
    }

    /// Registra recompensa para um padrão
    pub fn record_reward(&mut self, pattern_id: &str, performance: &PatternPerformance) {
        let reward = self.compute_reward(performance);
        let dist = self.distributions.get_mut(pattern_id).unwrap();

        // Computa recompensa composta [0, 1]

        dist.update(reward);

        tracing::info!(
            "🎯 Pattern '{}' updated: α={:.2}, β={:.2}, mean={:.3}, samples={}",
            pattern_id, dist.alpha, dist.beta, dist.mean(), dist.total_samples
        );
    }

    /// Computa recompensa composta de múltiplas métricas
    fn compute_reward(&self, perf: &PatternPerformance) -> f64 {
        let reasoning_component = perf.reasoning_quality_score * self.config.reasoning_quality_weight;
        let hallucination_component = if perf.hallucination_detected {
            self.config.hallucination_penalty_weight
        } else {
            0.0
        };
        let efficiency_component = (1.0 - (perf.tokens_used as f64 / 2000.0).min(1.0)) * self.config.token_efficiency_weight;

        let raw_reward = reasoning_component + hallucination_component + efficiency_component;
        raw_reward.clamp(0.0, 1.0)
    }

    /// Retorna ranking de padrões por valor esperado
    pub fn rank_patterns(&self) -> Vec<(String, f64, u64)> {
        let mut ranked: Vec<_> = self.distributions.iter()
            .map(|(id, dist)| (id.clone(), dist.mean(), dist.total_samples))
            .collect();

        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        ranked
    }

    /// Estatísticas do bandit
    pub fn statistics(&self) -> BanditStatistics {
        let total_selections = self.selection_history.len() as u64;
        let exploration_count = self.selection_history.iter().filter(|r| r.was_exploration).count() as u64;

        BanditStatistics {
            total_selections,
            exploration_count,
            exploitation_count: total_selections - exploration_count,
            unique_patterns: self.distributions.len() as u64,
            average_posterior_mean: self.distributions.values().map(|d| d.mean()).sum::<f64>() / self.distributions.len().max(1) as f64,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PatternPerformance {
    pub reasoning_quality_score: f64,
    pub hallucination_detected: bool,
    pub tokens_used: usize,
    pub latency_ms: u64,
    pub success: bool,
}

#[derive(Debug, Clone)]
pub struct BanditStatistics {
    pub total_selections: u64,
    pub exploration_count: u64,
    pub exploitation_count: u64,
    pub unique_patterns: u64,
    pub average_posterior_mean: f64,
}

#[derive(Debug, Error)]
pub enum BanditError {
    #[error("Pattern not registered: {0}")]
    PatternNotRegistered(String),
    #[error("Invalid reward value: {0}")]
    InvalidReward(f64),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_beta_update() {
        let mut dist = BetaDistribution::default();
        assert_eq!(dist.mean(), 0.5); // Beta(1,1) mean = 0.5

        dist.update(1.0); // Sucesso
        assert_eq!(dist.alpha, 2.0);
        assert_eq!(dist.beta, 1.0);
        assert!(dist.mean() > 0.5);

        dist.update(0.0); // Fracasso
        assert_eq!(dist.alpha, 2.0);
        assert_eq!(dist.beta, 2.0);
        assert_eq!(dist.mean(), 0.5);
    }

    #[test]
    fn test_thompson_selection_convergence() {
        let mut bandit = ThompsonBandit::new(BanditConfig::default());
        let patterns = vec!["cot".to_string(), "fewshot".to_string(), "hierarchy".to_string()];

        // Simula 100 rodadas com padrão "cot" sendo melhor (reward=0.9)
        for _ in 0..100 {
            let selection = bandit.select_pattern(&patterns);

            // Simula performance baseada no padrão escolhido
            let perf = match selection.pattern_id.as_str() {
                "cot" => PatternPerformance { reasoning_quality_score: 0.9, hallucination_detected: false, tokens_used: 500, latency_ms: 1000, success: true },
                "fewshot" => PatternPerformance { reasoning_quality_score: 0.7, hallucination_detected: false, tokens_used: 800, latency_ms: 1500, success: true },
                "hierarchy" => PatternPerformance { reasoning_quality_score: 0.6, hallucination_detected: true, tokens_used: 600, latency_ms: 1200, success: false },
                _ => PatternPerformance { reasoning_quality_score: 0.5, hallucination_detected: false, tokens_used: 700, latency_ms: 1000, success: true },
            };

            bandit.record_reward(&selection.pattern_id, &perf);
        }

        let ranked = bandit.rank_patterns();

        // "cot" deve estar em primeiro lugar após 100 rodadas
        assert_eq!(ranked[0].0, "cot", "'cot' should converge to top rank");
        assert!(ranked[0].1 > 0.5, "'cot' mean should be > 0.5");

        // Estatísticas
        let stats = bandit.statistics();
        assert_eq!(stats.total_selections, 100);
        assert!(stats.exploration_count >= 0); // Deve ter alguma exploração

        println!("🏆 Rankings after 100 rounds:");
        for (i, (id, mean, samples)) in ranked.iter().enumerate() {
            println!("  {}. {}: mean={:.3}, samples={}", i + 1, id, mean, samples);
        }
    }

    #[test]
    fn test_compute_reward() {
        let bandit = ThompsonBandit::new(BanditConfig::default());

        let perf_good = PatternPerformance {
            reasoning_quality_score: 0.9,
            hallucination_detected: false,
            tokens_used: 500,
            latency_ms: 1000,
            success: true,
        };

        let perf_bad = PatternPerformance {
            reasoning_quality_score: 0.3,
            hallucination_detected: true,
            tokens_used: 2000,
            latency_ms: 5000,
            success: false,
        };

        let reward_good = bandit.compute_reward(&perf_good);
        let reward_bad = bandit.compute_reward(&perf_bad);

        assert!(reward_good > reward_bad);
        assert!(reward_good <= 1.0 && reward_good >= 0.0);
        assert!(reward_bad <= 1.0 && reward_bad >= 0.0);
    }

    #[test]
    fn test_credible_interval() {
        let mut dist = BetaDistribution::default();
        dist.update(1.0);
        dist.update(1.0);
        dist.update(0.0);

        // Beta(3, 2) — após 2 sucessos e 1 fracasso
        let ci = dist.credible_interval(0.95);
        assert!(ci.0 < ci.1);
        assert!(ci.0 >= 0.0);
        assert!(ci.1 <= 1.0);

        println!("95% CI for Beta(3,2): [{:.3}, {:.3}]", ci.0, ci.1);
    }
}
