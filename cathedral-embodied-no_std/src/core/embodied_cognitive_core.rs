//! EmbodiedCognitiveCore – Loop cognitivo central do Cathedral ARKHE.
//! Integra ZK proofs, evolução de política (Aegis), monetização via PicoAds e persistência híbrida.

use crate::agi::aegis_evolution::{AegisEvolution, HubPerformance};
use crate::policy::ZkMemoryProofPolicy;
use crate::picoads::PicoAdsClient;
use crate::context::ContextEmbedding;
use crate::recorder::success_recorder_hybrid::SuccessRecorder;
use std::collections::HashMap;

pub struct EmbodiedCognitiveCore {
    // === Policy & Evolution ===
    pub current_policy: ZkMemoryProofPolicy,
    pub aegis_evolution: AegisEvolution,

    // === PicoAds Integration ===
    pub picoads_client: Option<PicoAdsClient>,
    pub last_memory_commitment: Option<String>,

    // === DLA / ZK Metrics ===
    pub dla_interference_avg: f32,
    pub last_calibration_error: f64,
    pub last_proof_latency_ms: f64,
    pub memory_proof_usage_rate: f32,

    // === Agent Behaviour ===
    pub recent_acceptance_rate: f32,
    pub stagnation_rounds: u32,
    pub high_risk_action_rate: f32,
    pub recent_audit_flags: u32,

    // === Persistence (Híbrido: SQLite + JSON fallback) ===
    pub success_recorder: Option<SuccessRecorder>,
    pub current_round: u32,

    // --- In‑memory recommendation tracking (fallback para consultas) ---
    pub recommendation_outcomes: Vec<(crate::picoads::PicoAdsRecommendation, bool)>, // (rec, accepted)
}

impl EmbodiedCognitiveCore {
    pub fn new(
        picoads_api_key: Option<String>,
        picoads_backend: Option<String>,
        _recorder_path: Option<&str>, // Ignorado — o SuccessRecorder decide sozinho
    ) -> Self {
        // Cria o recorder híbrido (tenta SQLite primeiro, cai para JSON automaticamente)
        let success_recorder = Some(SuccessRecorder::new());

        Self {
            current_policy: ZkMemoryProofPolicy::default(),
            aegis_evolution: AegisEvolution::new(picoads_api_key.clone(), picoads_backend.clone()),
            picoads_client: picoads_api_key.map(|key| PicoAdsClient::new(key, picoads_backend)),
            last_memory_commitment: None,
            dla_interference_avg: 0.0,
            last_calibration_error: 0.0,
            last_proof_latency_ms: 0.0,
            memory_proof_usage_rate: 0.0,
            recent_acceptance_rate: 0.5,
            stagnation_rounds: 0,
            high_risk_action_rate: 0.0,
            recent_audit_flags: 0,
            success_recorder,
            current_round: 0,
            recommendation_outcomes: Vec::new(),
        }
    }

    /// Tick principal — chame a cada rodada do agente.
    pub async fn tick_zk_with_accelerator(&mut self) -> Result<(), &'static str> {
        self.current_round += 1;

        // 1. Construir contexto rico
        let ctx = self.build_context_embedding();

        // 2. Coletar performance real dos hubs (do recorder ou fallback)
        let hub_stats = self.collect_hub_performance();

        // 3. Alimentar AegisEvolution com dados reais
        for (hub, perf) in hub_stats {
            self.aegis_evolution.update_hub_performance(
                hub,
                perf.acceptance_rate,
                perf.recommendation_volume,
            );
        }

        // 4. Evoluir política (desativa/reabilita hubs + mutações + decisão PicoAds)
        self.aegis_evolution.evolve_policy(&mut self.current_policy, &ctx);

        // 5. Gerar Memory Proof se a política exigir
        let memory_proof_used = if self.current_policy.require_memory_proof_for_recommendations {
            match crate::dla::prove_memory_state().await {
                Ok(proof) => {
                    self.last_memory_commitment = Some(proof.merkle_root);
                    true
                }
                Err(_) => false,
            }
        } else {
            false
        };

        // 6. Persistir métricas automaticamente (funciona com SQLite ou JSON)
        if let Some(recorder) = &mut self.success_recorder {
            recorder.record_round(
                self.current_round,
                self.recent_acceptance_rate,
                memory_proof_used,
            );
        }

        Ok(())
    }

    /// Coleta performance dos hubs usando o recorder híbrido (ou fallback neutro).
    fn collect_hub_performance(&self) -> HashMap<String, HubPerformance> {
        let mut result = HashMap::new();

        if let Some(recorder) = &self.success_recorder {
            if let Ok(stats) = recorder.recent_hub_stats(20) {
                for (hub, avg_acceptance, total_volume, avg_roas) in stats {
                    result.insert(hub, HubPerformance {
                        acceptance_rate: avg_acceptance,
                        recommendation_volume: total_volume,
                        roas: avg_roas,
                    });
                }
            }
        }

        // Fallback neutro caso não haja dados ainda
        if result.is_empty() {
            result.insert("defi-yield".to_string(), HubPerformance {
                acceptance_rate: 0.5,
                recommendation_volume: 0,
                roas: 0.0,
            });
        }

        result
    }

    fn build_context_embedding(&self) -> ContextEmbedding {
        ContextEmbedding {
            calibration_error: self.last_calibration_error,
            avg_interference: self.dla_interference_avg,
            acceptance_rate: self.recent_acceptance_rate,
            proof_latency_ms: self.last_proof_latency_ms,
            memory_proof_usage_rate: self.memory_proof_usage_rate,
            high_risk_action_rate: self.high_risk_action_rate,
            recent_audit_flags: self.recent_audit_flags,
            stagnation_rounds: self.stagnation_rounds,
        }
    }

    /// Aceita uma recomendação (feedback do usuário).
    pub fn accept_recommendation(&mut self, rec_id: &str) {
        if let Some(entry) = self.recommendation_outcomes.iter_mut().find(|(r, _)| r.url == rec_id) {
            entry.1 = true;
            println!("[Core] Recomendação aceita: {}", rec_id);
        }
    }

    /// Processa recomendações recebidas do PicoAds (armazena para fallback).
    pub fn process_recommendations(&mut self, recs: Vec<crate::picoads::PicoAdsRecommendation>) {
        for rec in recs {
            self.recommendation_outcomes.push((rec, false));
        }
    }

    /// Método de conveniência para buscar recomendações via PicoAds.
    pub async fn get_picoads_recommendations(
        &self,
        query: &str,
        hub: Option<&str>,
        max_results: Option<u32>,
    ) -> Result<Vec<crate::picoads::PicoAdsRecommendation>, String> {
        let client = self.picoads_client.as_ref()
            .ok_or("PicoAds client não inicializado")?;

        client.get_recommendations(query, hub, max_results)
            .await
            .map_err(|e| e.to_string())
    }

    /// Graceful shutdown — garante que os dados sejam persistidos.
    pub fn shutdown(&mut self) {
        if let Some(recorder) = &mut self.success_recorder {
            recorder.flush();
        }
    }
}
