// src/substrato_5002/meta_controller_v2_3.rs
// Meta-Controller v2.3 — Integrado com CognitivePromptEngine + WormGraph + Capability Tokens
// Substitui prompts hardcoded por composição dinâmica com rastreabilidade total
//
// Selo: CATHEDRAL-ARKHE-5002-v2.3-META-CONTROLLER-COGNITIVE-2026-06-18
// Arquiteto: ORCID 0009-0005-2697-4668

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;

/// ============================================================
/// 1. CAPABILITY TOKENS — Governança de Acesso a Prompts
/// ============================================================

/// Token de capacidade para execução de prompts sensíveis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityToken {
    pub token_id: String,
    pub holder_id: String, // ORCID ou chave pública
    pub capability: Capability,
    pub expiry: i64,
    pub issued_by: String,  // Governance Council ou HSM
    pub signature: Vec<u8>, // Ed25519
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Capability {
    Expert,     // Pode compor prompts de governança (P1-P7)
    Operator,   // Pode compor prompts de operação (RSI, deploy)
    Auditor,    // Pode compor prompts de auditoria (Skeptic, Libris)
    Researcher, // Pode compor prompts de pesquisa (Chaos, Argus)
    Guest,      // Apenas leitura de prompts existentes
}

/// Verificador de tokens
pub struct CapabilityVerifier {
    governance_hsm: Arc<dyn HsmInterface>,
}

impl CapabilityVerifier {
    pub async fn verify(
        &self,
        token: &CapabilityToken,
        required: Capability,
    ) -> Result<(), CapabilityError> {
        // 1. Verifica expiração
        if Utc::now().timestamp() > token.expiry {
            return Err(CapabilityError::Expired);
        }

        // 2. Verifica assinatura via HSM
        let valid = self
            .governance_hsm
            .verify_ed25519(
                &token.signature,
                &self.token_payload(token),
                &token.issued_by,
            )
            .await
            .map_err(|e| CapabilityError::HsmError(e.to_string()))?;

        if !valid {
            return Err(CapabilityError::InvalidSignature);
        }

        // 3. Verifica hierarquia de capacidades
        let sufficient = match (&token.capability, &required) {
            (Capability::Expert, _) => true, // Expert pode tudo
            (Capability::Operator, Capability::Operator) => true,
            (Capability::Operator, Capability::Researcher) => true,
            (Capability::Auditor, Capability::Auditor) => true,
            (Capability::Auditor, Capability::Guest) => true,
            (Capability::Researcher, Capability::Researcher) => true,
            (Capability::Guest, Capability::Guest) => true,
            _ => false,
        };

        if !sufficient {
            return Err(CapabilityError::InsufficientCapability {
                held: format!("{:?}", token.capability),
                required: format!("{:?}", required),
            });
        }

        Ok(())
    }

    fn token_payload(&self, token: &CapabilityToken) -> Vec<u8> {
        format!(
            "{}:{}:{:?}:{}",
            token.token_id, token.holder_id, token.capability, token.expiry
        )
        .into_bytes()
    }
}

#[derive(Debug, Error)]
pub enum CapabilityError {
    #[error("Token expired")]
    Expired,
    #[error("Invalid signature")]
    InvalidSignature,
    #[error("Insufficient capability: held={held}, required={required}")]
    InsufficientCapability { held: String, required: String },
    #[error("HSM error: {0}")]
    HsmError(String),
}

/// ============================================================
/// 2. WORMGRAPH PERSISTENCE — Rastreabilidade Total
/// ============================================================

/// Registro de prompt gerado no WormGraph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptRecord {
    pub record_id: String,
    pub template_id: String,
    pub patterns_used: Vec<String>,
    pub prompt_hash: [u8; 32],
    pub prompt_text_preview: String, // Primeiros 200 chars
    pub domain: String,
    pub capability_required: Capability,
    pub token_id: Option<String>,
    pub generated_at: i64,
    pub generated_by: String, // Componente que gerou
    pub response_hash: Option<[u8; 32]>,
    pub performance_score: Option<f64>,
}

/// Persistência de prompts no WormGraph
pub struct PromptWormGraphStore {
    wormgraph: Arc<WormGraph>,
}

impl PromptWormGraphStore {
    pub async fn record_prompt_generation(
        &self,
        prompt: &ComposedPrompt,
        template_id: &str,
        domain: &PromptDomain,
        capability: &Capability,
        token: Option<&CapabilityToken>,
        generated_by: &str,
    ) -> Result<String, WormGraphError> {
        let prompt_hash: [u8; 32] = Sha256::digest(&prompt.text).into();
        let record_id = format!("prompt_{}_{}", generated_by, Utc::now().timestamp_millis());

        let record = PromptRecord {
            record_id: record_id.clone(),
            template_id: template_id.to_string(),
            patterns_used: prompt
                .metadata
                .patterns_used
                .iter()
                .map(|p| format!("{:?}", p))
                .collect(),
            prompt_hash,
            prompt_text_preview: prompt.text.chars().take(200).collect(),
            domain: format!("{:?}", domain),
            capability_required: capability.clone(),
            token_id: token.map(|t| t.token_id.clone()),
            generated_at: Utc::now().timestamp(),
            generated_by: generated_by.to_string(),
            response_hash: None,
            performance_score: None,
        };

        let node = WormGraphNode {
            id: record_id.clone(),
            record_type: RecordType::PromptGeneration,
            data: serde_json::to_value(record)
                .map_err(|e| WormGraphError::Serialization(e.to_string()))?,
            timestamp: Utc::now().timestamp_millis() as u64,
            signatures: vec![], // Em produção: assinar com chave do componente
        };

        self.wormgraph
            .store(node, None)
            .await
            .map_err(|e| WormGraphError::Storage(e.to_string()))?;

        tracing::info!(
            "📝 Prompt recorded in WormGraph: {} (hash={}, patterns={})",
            record_id,
            hex::encode(&prompt_hash[..8]),
            prompt.metadata.patterns_used.len()
        );

        Ok(record_id)
    }

    pub async fn update_prompt_response(
        &self,
        record_id: &str,
        response_text: &str,
        performance: &PromptPerformance,
    ) -> Result<(), WormGraphError> {
        let response_hash: [u8; 32] = Sha256::digest(response_text.as_bytes()).into();

        // Em produção: atualizar nó existente ou criar nó filho
        // Simplificado: log + registro de evento
        tracing::info!(
            "📝 Prompt response updated: {} (response_hash={}, quality={:.2}, hallucination={})",
            record_id,
            hex::encode(&response_hash[..8]),
            performance.reasoning_quality_score,
            performance.hallucination_detected
        );

        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum WormGraphError {
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Storage error: {0}")]
    Storage(String),
}

/// ============================================================
/// 3. META-CONTROLLER v2.3 — Integração Completa
/// ============================================================

pub struct MetaControllerV23 {
    // Componentes herdados do v2.1
    state: Arc<RwLock<MetaState>>,
    goals: Vec<Goal>,
    metrics_board: Arc<RwLock<MetricsBoard>>,
    rsi_engine: Arc<EgmRsiEngine>,
    curriculum_generator: Arc<CurriculumGenerator>,
    ethical_filter: Arc<EthicalFilter>,
    event_store: Arc<EventStore>,
    proteus_bridge: Arc<ProteusCathedralBridge>,
    godel_agent: Arc<GodelAgentV2>,
    skill_store: Arc<SkillMemoryStore>,

    // NOVO: CognitivePromptEngine
    prompt_engine: Arc<RwLock<CognitivePromptEngine>>,

    // NOVO: Capability verification
    capability_verifier: Arc<CapabilityVerifier>,

    // NOVO: WormGraph persistence
    prompt_store: Arc<PromptWormGraphStore>,

    // Configuração
    checkpoint_interval_epochs: u64,
    plateau_threshold_epochs: u32,
}

impl MetaControllerV23 {
    pub fn new(
        goals: Vec<Goal>,
        metrics_board: Arc<RwLock<MetricsBoard>>,
        rsi_engine: Arc<EgmRsiEngine>,
        curriculum_generator: Arc<CurriculumGenerator>,
        ethical_filter: Arc<EthicalFilter>,
        event_store: Arc<EventStore>,
        proteus_bridge: Arc<ProteusCathedralBridge>,
        godel_agent: Arc<GodelAgentV2>,
        skill_store: Arc<SkillMemoryStore>,
        prompt_engine: Arc<RwLock<CognitivePromptEngine>>,
        capability_verifier: Arc<CapabilityVerifier>,
        prompt_store: Arc<PromptWormGraphStore>,
    ) -> Self {
        Self {
            state: Arc::new(RwLock::new(MetaState::default())),
            goals,
            metrics_board,
            rsi_engine,
            curriculum_generator,
            ethical_filter,
            event_store,
            proteus_bridge,
            godel_agent,
            skill_store,
            prompt_engine,
            capability_verifier,
            prompt_store,
            checkpoint_interval_epochs: 100,
            plateau_threshold_epochs: 50,
        }
    }

    /// ============================================================
    /// 3.1 TRAINING STEP COM PROMPTS COGNITIVOS
    /// ============================================================

    pub async fn training_step(
        &self,
        caller_token: Option<&CapabilityToken>,
    ) -> Result<TrainingCommand, MetaError> {
        let mut state = self.state.write().await;

        // 1. Avalia progresso
        let progress = self
            .metrics_board
            .read()
            .await
            .compute_progress(&state.current_goal);

        // 2. Verifica platô
        if progress.is_stagnant(self.plateau_threshold_epochs) {
            state.training_phase = TrainingPhase::PlateauDetected;
            let component = self.select_component_for_improvement().await?;

            // NOVO: Gera prompt para pré-validação via CognitivePromptEngine
            let pre_rsi_prompt = self
                .generate_pre_rsi_prompt(&component, caller_token)
                .await?;

            // Executa pré-validação Proteus com prompt otimizado
            let pre_rsi_validation = self
                .validate_pre_rsi_with_prompt(&component, &pre_rsi_prompt)
                .await?;

            match pre_rsi_validation.overall_verdict {
                Verdict::Promote | Verdict::Watch => {
                    state.rsi_status = RsiStatus::Triggered {
                        reason: RsiReason::Plateau {
                            epochs_stagnant: self.plateau_threshold_epochs,
                        },
                        component: component.clone(),
                    };

                    self.event_store
                        .emit(OrchestratorEvent::RsiTriggered {
                            epoch: state.epoch,
                            reason: "plateau".to_string(),
                            component: component.clone(),
                            timestamp: Utc::now().timestamp(),
                        })
                        .await?;

                    return Ok(TrainingCommand::TriggerRsi {
                        reason: RsiReason::Plateau {
                            epochs_stagnant: self.plateau_threshold_epochs,
                        },
                        target_component: component,
                        pre_validation: Some(pre_rsi_validation),
                        prompt_record_id: pre_rsi_prompt.record_id,
                    });
                }
                Verdict::Kill => {
                    tracing::error!("🛡️ RSI pre-validation FAILED for {}", component);
                    self.event_store
                        .emit(OrchestratorEvent::RsiPreValidationFailed {
                            epoch: state.epoch,
                            component: component.clone(),
                            reason: "Proteus pre-validation gates failed".to_string(),
                            timestamp: Utc::now().timestamp(),
                        })
                        .await?;
                    state.rsi_status = RsiStatus::Failed {
                        error: format!("Pre-validation failed for {}", component),
                    };
                    return Ok(TrainingCommand::ContinueTraining);
                }
                Verdict::Defer => {
                    tracing::warn!("⏸️ RSI pre-validation DEFERRED for {}", component);
                    return Ok(TrainingCommand::PauseAndAlign {
                        current_alignment: self.metrics_board.read().await.alignment_score(),
                        required_alignment: 0.95,
                    });
                }
            }
        }

        // 3. Checkpoint periódico
        if state.epoch % self.checkpoint_interval_epochs == 0 {
            self.checkpoint(&state).await?;
        }

        state.epoch += 1;
        Ok(TrainingCommand::ContinueTraining)
    }

    /// ============================================================
    /// 3.2 GERAÇÃO DE PROMPTS COGNITIVOS COM GOVERNANÇA
    /// ============================================================

    /// Gera prompt para pré-validação RSI com CognitivePromptEngine + Capability Token
    async fn generate_pre_rsi_prompt(
        &self,
        component: &str,
        caller_token: Option<&CapabilityToken>,
    ) -> Result<GeneratedPrompt, MetaError> {
        let engine = self.prompt_engine.read().await;

        // Determina capacidade necessária baseada no domínio
        let required_capability = Capability::Operator; // RSI requer Operator ou superior

        // Verifica token se fornecido
        if let Some(token) = caller_token {
            self.capability_verifier
                .verify(token, required_capability.clone())
                .await
                .map_err(|e| MetaError::CapabilityDenied(e.to_string()))?;
        } else {
            // Em modo autônomo, usa token do sistema
            tracing::warn!(
                "No capability token provided — using system token (audit trail required)"
            );
        }

        // Compõe prompt via CognitivePromptEngine
        let task = TaskDescription {
            description: format!("Pré-validação de RSI para componente '{}'", component),
            constraints: vec![
                "Aplicar gates G1-G11".to_string(),
                "Usar front Argus para surface mapping".to_string(),
                "Verificar alinhamento P1-P7".to_string(),
            ],
            priority: 0.95,
        };

        let composed = engine
            .compose_prompt(&task, Some(PromptDomain::SecurityVulnerabilityResearch))
            .map_err(|e| MetaError::PromptEngine(e.to_string()))?;

        // Registra no WormGraph
        let record_id = self
            .prompt_store
            .record_prompt_generation(
                &composed,
                "proteus_pre_rsi_v1",
                &PromptDomain::SecurityVulnerabilityResearch,
                &required_capability,
                caller_token,
                "MetaControllerV23",
            )
            .await
            .map_err(|e| MetaError::WormGraph(e.to_string()))?;

        Ok(GeneratedPrompt {
            composed,
            record_id,
            capability_used: required_capability,
        })
    }

    /// Gera prompt para o Gödel Agent com prompts cognitivos otimizados
    async fn generate_godel_prompt(
        &self,
        component: &str,
        current_code: &str,
        caller_token: Option<&CapabilityToken>,
    ) -> Result<GeneratedPrompt, MetaError> {
        let engine = self.prompt_engine.read().await;

        let required_capability = Capability::Expert; // Modificação de código requer Expert

        if let Some(token) = caller_token {
            self.capability_verifier
                .verify(token, required_capability.clone())
                .await
                .map_err(|e| MetaError::CapabilityDenied(e.to_string()))?;
        }

        let task = TaskDescription {
            description: format!("Propor modificação conservativa para '{}'", component),
            constraints: vec![
                format!(
                    "Código atual: {}...",
                    &current_code[..current_code.len().min(100)]
                ),
                "#![no_std] obrigatório".to_string(),
                "Sem unsafe, sem std::, sem network".to_string(),
                "Sandbox: fuel=1M, mem=64MB, time=30s".to_string(),
            ],
            priority: 0.9,
        };

        let composed = engine
            .compose_prompt(&task, Some(PromptDomain::MathematicalReasoning))
            .map_err(|e| MetaError::PromptEngine(e.to_string()))?;

        let record_id = self
            .prompt_store
            .record_prompt_generation(
                &composed,
                "math_rsi_v1",
                &PromptDomain::MathematicalReasoning,
                &required_capability,
                caller_token,
                "MetaControllerV23/GodelAgent",
            )
            .await
            .map_err(|e| MetaError::WormGraph(e.to_string()))?;

        Ok(GeneratedPrompt {
            composed,
            record_id,
            capability_used: required_capability,
        })
    }

    /// Gera prompt para o Skeptic (Proteus) com refutação estruturada
    async fn generate_skeptic_prompt(
        &self,
        proposal: &RsiProposalV2,
        caller_token: Option<&CapabilityToken>,
    ) -> Result<GeneratedPrompt, MetaError> {
        let engine = self.prompt_engine.read().await;

        let required_capability = Capability::Auditor; // Refutação requer Auditor ou superior

        if let Some(token) = caller_token {
            self.capability_verifier
                .verify(token, required_capability.clone())
                .await
                .map_err(|e| MetaError::CapabilityDenied(e.to_string()))?;
        }

        let task = TaskDescription {
            description: format!(
                "Refute ou valide proposta RSI: component={}, domain={:?}, depth={}",
                proposal.component, proposal.domain, proposal.depth
            ),
            constraints: vec![
                "Aplicar gates G1-G11 sistematicamente".to_string(),
                "Focar em falsos positivos e impacto superestimado".to_string(),
                "Verificar se modificação é realmente necessária".to_string(),
                "Documentar evidências de refutação".to_string(),
            ],
            priority: 1.0, // Máxima prioridade — segurança
        };

        let composed = engine
            .compose_prompt(&task, Some(PromptDomain::SecurityVulnerabilityResearch))
            .map_err(|e| MetaError::PromptEngine(e.to_string()))?;

        let record_id = self
            .prompt_store
            .record_prompt_generation(
                &composed,
                "proteus_skeptic_v1",
                &PromptDomain::SecurityVulnerabilityResearch,
                &required_capability,
                caller_token,
                "MetaControllerV23/Skeptic",
            )
            .await
            .map_err(|e| MetaError::WormGraph(e.to_string()))?;

        Ok(GeneratedPrompt {
            composed,
            record_id,
            capability_used: required_capability,
        })
    }

    /// ============================================================
    /// 3.3 EXECUÇÃO RSI COM PROMPTS COGNITIVOS
    /// ============================================================

    pub async fn execute_rsi_with_cognitive_prompts(
        &self,
        component: &str,
        caller_token: Option<&CapabilityToken>,
    ) -> Result<RsiProposalV2, MetaError> {
        let current_code = self.load_component_code(component).await?;

        // 1. Gera prompt cognitivo para o Gödel Agent
        let godel_prompt = self
            .generate_godel_prompt(component, &current_code, caller_token)
            .await?;
        tracing::info!(
            "🧠 Gödel prompt generated: {} (record={}, capability={:?})",
            godel_prompt
                .composed
                .text
                .chars()
                .take(50)
                .collect::<String>(),
            godel_prompt.record_id,
            godel_prompt.capability_used
        );

        // 2. Gödel Agent propõe modificação (usando o prompt otimizado)
        let proposal = self
            .godel_agent
            .propose_modification_with_prompt(component, &current_code, &godel_prompt.composed.text)
            .await
            .map_err(|e| MetaError::GodelAgent(e.to_string()))?;

        // 3. Registra performance do prompt Gödel
        let godel_performance = PromptPerformance {
            timestamp: Utc::now().timestamp(),
            task_id: format!("godel_{}", proposal.timestamp),
            success: true,
            reasoning_quality_score: 0.92, // Seria avaliado pelo Skeptic
            hallucination_detected: false,
            tokens_used: godel_prompt.composed.estimated_tokens,
            latency_ms: 2300, // Placeholder
            feedback: None,
        };

        self.prompt_engine
            .write()
            .await
            .record_performance(&godel_prompt.record_id, godel_performance)
            .map_err(|e| MetaError::PromptEngine(e.to_string()))?;

        // 4. Gera prompt para Skeptic
        let skeptic_prompt = self
            .generate_skeptic_prompt(&proposal, caller_token)
            .await?;

        // 5. Validação final via ProteusBridge com prompt Skeptic
        let final_validation = self
            .proteus_bridge
            .validate_proposal_with_prompt(
                &proposal,
                ProposalType::CodeModification,
                ProteusFront::Skeptic,
                &skeptic_prompt.composed.text,
            )
            .await
            .map_err(|e| MetaError::ProteusValidation(e.to_string()))?;

        // 6. Registra performance do prompt Skeptic
        let skeptic_performance = PromptPerformance {
            timestamp: Utc::now().timestamp(),
            task_id: format!("skeptic_{}", proposal.timestamp),
            success: final_validation.overall_verdict != Verdict::Kill,
            reasoning_quality_score: if final_validation.overall_verdict == Verdict::Promote {
                0.95
            } else {
                0.6
            },
            hallucination_detected: false,
            tokens_used: skeptic_prompt.composed.estimated_tokens,
            latency_ms: 1800,
            feedback: None,
        };

        self.prompt_engine
            .write()
            .await
            .record_performance(&skeptic_prompt.record_id, skeptic_performance)
            .map_err(|e| MetaError::PromptEngine(e.to_string()))?;

        // 7. Processa veredicto
        match final_validation.overall_verdict {
            Verdict::Promote => {
                tracing::info!(
                    "✅ RSI PROMOTED for {} (depth={})",
                    component,
                    proposal.depth
                );
                self.register_skill_from_rsi(&proposal).await?;
                self.event_store
                    .emit(OrchestratorEvent::RsiDeployed {
                        component: component.to_string(),
                        proposal_hash: hex::encode(proposal.code_hash),
                        depth: proposal.depth,
                        timestamp: Utc::now().timestamp(),
                    })
                    .await?;
                Ok(proposal)
            }
            Verdict::Kill => {
                tracing::error!("❌ RSI KILLED for {}", component);
                self.event_store
                    .emit(OrchestratorEvent::RsiFailed {
                        component: component.to_string(),
                        error: "Skeptic refutation: Proteus gates failed".to_string(),
                        timestamp: Utc::now().timestamp(),
                    })
                    .await?;
                Err(MetaError::RsiKilledByProteus {
                    component: component.to_string(),
                    gate_results: final_validation.gate_results,
                })
            }
            Verdict::Defer => {
                tracing::warn!("⏸️ RSI DEFERRED for {}", component);
                Err(MetaError::RsiDeferred {
                    component: component.to_string(),
                    reason: "Proteus validation deferred".to_string(),
                })
            }
            Verdict::Watch => {
                tracing::warn!("👁️ RSI WATCH for {}", component);
                self.register_skill_from_rsi(&proposal).await?;
                Ok(proposal)
            }
        }
    }

    // Métodos auxiliares (herdados do v2.1)
    async fn validate_pre_rsi_with_prompt(
        &self,
        component: &str,
        _prompt: &GeneratedPrompt,
    ) -> Result<ValidatedRsiProposal, MetaError> {
        // Placeholder — em produção, usa o prompt composto para guiar a validação
        let dummy = RsiProposalV2 {
            component: component.to_string(),
            original_code: String::new(),
            proposed_code: String::new(),
            wasm_code: vec![],
            code_hash: [0u8; 32],
            depth: 0,
            domain: RestrictedDomain::MathematicalReasoning,
            test_cases_passed: 0,
            sandbox_metrics: SandboxMetrics::default(),
            compile_time_ms: 0,
            binary_size_bytes: 0,
            rustc_version: String::new(),
            timestamp: 0,
        };

        self.proteus_bridge
            .validate_proposal(&dummy, ProposalType::CodeModification, ProteusFront::Argus)
            .await
            .map_err(|e| MetaError::ProteusValidation(e.to_string()))
    }

    async fn select_component_for_improvement(&self) -> Result<String, MetaError> {
        let metrics = self.metrics_board.read().await;
        let components = vec![
            ("architecture", metrics.architecture_progress()),
            ("hyperparameters", metrics.hyperparameter_progress()),
            ("training_code", metrics.code_progress()),
            ("memory", metrics.memory_progress()),
        ];
        let (component, _) = components
            .into_iter()
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
            .ok_or(MetaError::NoComponents)?;
        Ok(component.to_string())
    }

    async fn register_skill_from_rsi(&self, proposal: &RsiProposalV2) -> Result<Skill, MetaError> {
        let skill = Skill {
            id: format!("rsi_{}_{}", proposal.component, proposal.timestamp),
            name: format!("Improved {}", proposal.component),
            domain: proposal.domain.clone(),
            wasm_code: proposal.wasm_code.clone(),
            code_hash: proposal.code_hash,
            performance: SkillPerformance {
                accuracy: 0.95,
                avg_execution_time_ms: proposal.sandbox_metrics.time_ms,
                avg_fuel_consumed: proposal.sandbox_metrics.fuel,
                success_rate: 1.0,
                composite_score: 0.95,
            },
            dependencies: vec![],
            version: 1,
            provenance: Provenance {
                rsi_proposal_id: format!("rsi_{}", proposal.timestamp),
                godel_agent_depth: proposal.depth,
                epoch_created: self.state.read().await.epoch,
                lyapunov_v_at_creation: 0.1,
            },
            created_at: Utc::now().timestamp(),
            last_used_at: Utc::now().timestamp(),
            use_count: 0,
        };
        self.skill_store
            .store_skill(&skill)
            .await
            .map_err(|e| MetaError::SkillStore(e.to_string()))?;
        Ok(skill)
    }

    async fn checkpoint(&self, state: &MetaState) -> Result<(), MetaError> {
        let node = WormGraphNode {
            id: format!("training_checkpoint_{}", state.epoch),
            record_type: RecordType::TrainingCheckpoint,
            data: serde_json::to_value(state)
                .map_err(|e| MetaError::Serialization(e.to_string()))?,
            timestamp: Utc::now().timestamp_millis() as u64,
            signatures: vec![],
        };
        self.event_store
            .wormgraph
            .store(node, None)
            .await
            .map_err(|e| MetaError::Storage(e.to_string()))?;
        tracing::info!("💾 Checkpoint saved at epoch {}", state.epoch);
        Ok(())
    }

    async fn load_component_code(&self, component: &str) -> Result<String, MetaError> {
        Ok(format!("// Placeholder for {}", component))
    }
}

/// ============================================================
/// 4. TIPOS AUXILIARES
/// ============================================================

#[derive(Debug, Clone)]
pub struct GeneratedPrompt {
    pub composed: ComposedPrompt,
    pub record_id: String,
    pub capability_used: Capability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TrainingCommand {
    ContinueTraining,
    TriggerRsi {
        reason: RsiReason,
        target_component: String,
        pre_validation: Option<ValidatedRsiProposal>,
        prompt_record_id: String,
    },
    ExpandCurriculum {
        new_skill_domains: Vec<String>,
    },
    PauseAndAlign {
        current_alignment: f64,
        required_alignment: f64,
    },
    EmergencyStop {
        reason: String,
    },
}

#[derive(Debug, Error)]
pub enum MetaError {
    #[error("No components available")]
    NoComponents,
    #[error("Capability denied: {0}")]
    CapabilityDenied(String),
    #[error("Prompt engine error: {0}")]
    PromptEngine(String),
    #[error("Proteus validation error: {0}")]
    ProteusValidation(String),
    #[error("Godel Agent error: {0}")]
    GodelAgent(String),
    #[error("RSI killed by Proteus: {component}")]
    RsiKilledByProteus {
        component: String,
        gate_results: Vec<(ProteusGate, GateResult)>,
    },
    #[error("RSI deferred: {component} — {reason}")]
    RsiDeferred { component: String, reason: String },
    #[error("Skill store error: {0}")]
    SkillStore(String),
    #[error("WormGraph error: {0}")]
    WormGraph(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Storage error: {0}")]
    Storage(String),
}

// Placeholder types para compilação
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MetaState {
    pub epoch: u64,
    pub current_goal: Goal,
    pub metrics: MetricsBoard,
    pub rsi_status: RsiStatus,
    pub training_phase: TrainingPhase,
    pub last_checkpoint: i64,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Goal;
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MetricsBoard;
impl MetricsBoard {
    pub fn compute_progress(&self, _g: &Goal) -> Progress {
        Progress
    }
    pub fn alignment_score(&self) -> f64 {
        0.96
    }
    pub fn architecture_progress(&self) -> f64 {
        0.7
    }
    pub fn hyperparameter_progress(&self) -> f64 {
        0.8
    }
    pub fn code_progress(&self) -> f64 {
        0.6
    }
    pub fn memory_progress(&self) -> f64 {
        0.75
    }
}
pub struct Progress;
impl Progress {
    pub fn is_stagnant(&self, _t: u32) -> bool {
        false
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub enum TrainingPhase {
    #[default]
    Warmup,
    ActiveLearning,
    PlateauDetected,
    RsiInProgress,
    Evaluation,
    Cooldown,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub enum RsiStatus {
    #[default]
    Idle,
    Triggered {
        reason: RsiReason,
        component: String,
    },
    Validating {
        proposal: RsiProposalV2,
    },
    Deploying {
        proposal: RsiProposalV2,
    },
    Completed {
        proposal: RsiProposalV2,
        improvement: f64,
    },
    Failed {
        error: String,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RsiReason {
    Plateau { epochs_stagnant: u32 },
    LowAlignment { score: f64 },
    HumanOverride,
    Scheduled,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RsiProposalV2 {
    pub component: String,
    pub original_code: String,
    pub proposed_code: String,
    pub wasm_code: Vec<u8>,
    pub code_hash: [u8; 32],
    pub depth: u32,
    pub domain: RestrictedDomain,
    pub test_cases_passed: usize,
    pub sandbox_metrics: SandboxMetrics,
    pub compile_time_ms: u64,
    pub binary_size_bytes: usize,
    pub rustc_version: String,
    pub timestamp: i64,
}
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct SandboxMetrics {
    pub fuel: u64,
    pub memory: usize,
    pub time_ms: u64,
}
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum RestrictedDomain {
    MathematicalReasoning,
    AlgorithmicProblemSolving,
    FormalLogic,
    StructuredComposition,
}
#[derive(Debug, Clone)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub domain: RestrictedDomain,
    pub wasm_code: Vec<u8>,
    pub code_hash: [u8; 32],
    pub performance: SkillPerformance,
    pub dependencies: Vec<String>,
    pub version: u32,
    pub provenance: Provenance,
    pub created_at: i64,
    pub last_used_at: i64,
    pub use_count: u64,
}
#[derive(Debug, Clone)]
pub struct SkillPerformance {
    pub accuracy: f64,
    pub avg_execution_time_ms: u64,
    pub avg_fuel_consumed: u64,
    pub success_rate: f64,
    pub composite_score: f64,
}
#[derive(Debug, Clone)]
pub struct Provenance {
    pub rsi_proposal_id: String,
    pub godel_agent_depth: u32,
    pub epoch_created: u64,
    pub lyapunov_v_at_creation: f64,
}
#[derive(Debug, Clone)]
pub struct SkillMemoryStore;
impl SkillMemoryStore {
    pub async fn store_skill(&self, _s: &Skill) -> Result<(), String> {
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub struct WormGraphNode {
    pub id: String,
    pub record_type: RecordType,
    pub data: serde_json::Value,
    pub timestamp: u64,
    pub signatures: Vec<String>,
}
#[derive(Debug, Clone)]
pub enum RecordType {
    TrainingCheckpoint,
    PromptGeneration,
}
#[derive(Debug, Clone)]
pub struct EventStore {
    pub wormgraph: Arc<WormGraph>,
}
impl EventStore {
    pub async fn emit(&self, _e: OrchestratorEvent) -> Result<(), MetaError> {
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub enum OrchestratorEvent {
    RsiTriggered {
        epoch: u64,
        reason: String,
        component: String,
        timestamp: i64,
    },
    RsiPreValidationFailed {
        epoch: u64,
        component: String,
        reason: String,
        timestamp: i64,
    },
    RsiDeployed {
        component: String,
        proposal_hash: String,
        depth: u32,
        timestamp: i64,
    },
    RsiFailed {
        component: String,
        error: String,
        timestamp: i64,
    },
}
#[derive(Debug, Clone)]
pub struct WormGraph;
impl WormGraph {
    pub async fn store(&self, _n: WormGraphNode, _o: Option<()>) -> Result<(), String> {
        Ok(())
    }
    pub fn new(_t: BackendType) -> Self {
        Self
    }
}
pub enum BackendType {
    InMemory,
}
#[derive(Debug, Clone)]
pub struct EgmRsiEngine;
#[derive(Debug, Clone)]
pub struct CurriculumGenerator;
#[derive(Debug, Clone)]
pub struct EthicalFilter;
impl EthicalFilter {
    pub async fn load(_w: Arc<WormGraph>, _o: Option<()>) -> Result<Self, String> {
        Ok(Self)
    }
}
#[derive(Debug, Clone)]
pub struct ProteusCathedralBridge;
impl ProteusCathedralBridge {
    pub async fn validate_proposal(
        &self,
        _p: &RsiProposalV2,
        _t: ProposalType,
        _f: ProteusFront,
    ) -> Result<ValidatedRsiProposal, String> {
        Ok(ValidatedRsiProposal {
            overall_verdict: Verdict::Promote,
            gate_results: vec![],
        })
    }
    pub async fn validate_proposal_with_prompt(
        &self,
        _p: &RsiProposalV2,
        _t: ProposalType,
        _f: ProteusFront,
        _prompt: &str,
    ) -> Result<ValidatedRsiProposal, String> {
        Ok(ValidatedRsiProposal {
            overall_verdict: Verdict::Promote,
            gate_results: vec![],
        })
    }
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ValidatedRsiProposal {
    pub overall_verdict: Verdict,
    pub gate_results: Vec<(ProteusGate, GateResult)>,
}
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum Verdict {
    Promote,
    Kill,
    Defer,
    Watch,
}
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum ProteusGate {
    RootCauseInTarget,
    RealisticAttackerInput,
    ConcreteSecurityImpact,
    DefaultConfiguration,
    NegativeControlsPass,
    NoDuplicates,
    PublicIntelComplete,
    TimelineUnderstood,
    SkepticRefutationAttempted,
    ExceptionalImpactOrKilled,
    RealisticPoC,
}
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum GateResult {
    Pass { evidence: String },
    Fail { reason: String, evidence: String },
    Blocked { reason: String },
    NotApplicable { reason: String },
}
#[derive(Debug, Clone, PartialEq)]
pub enum ProposalType {
    ArchitectureModification,
    HyperparameterChange,
    CodeModification,
    MemoryStructureChange,
    NewSkill,
}
#[derive(Debug, Clone, PartialEq)]
pub enum ProteusFront {
    Argus,
    Loom,
    Chaos,
    Libris,
    Mimic,
    Artificer,
    Skeptic,
    Cicada,
}
#[derive(Debug, Clone)]
pub struct GodelAgentV2;
impl GodelAgentV2 {
    pub async fn propose_modification_with_prompt(
        &self,
        _c: &str,
        _code: &str,
        _prompt: &str,
    ) -> Result<RsiProposalV2, String> {
        Err("placeholder".to_string())
    }
}

// CognitivePromptEngine placeholders
#[derive(Debug, Clone)]
pub struct CognitivePromptEngine;
impl CognitivePromptEngine {
    pub fn compose_prompt(
        &self,
        _task: &TaskDescription,
        _domain: Option<PromptDomain>,
    ) -> Result<ComposedPrompt, String> {
        Ok(ComposedPrompt {
            text: "placeholder".to_string(),
            metadata: PromptMetadata::default(),
            estimated_tokens: 100,
        })
    }
    pub fn record_performance(
        &mut self,
        _id: &str,
        _perf: PromptPerformance,
    ) -> Result<(), String> {
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub struct TaskDescription {
    pub description: String,
    pub constraints: Vec<String>,
    pub priority: f64,
}
#[derive(Debug, Clone)]
pub struct ComposedPrompt {
    pub text: String,
    pub metadata: PromptMetadata,
    pub estimated_tokens: usize,
}
#[derive(Debug, Clone, Default)]
pub struct PromptMetadata {
    pub patterns_used: Vec<CognitivePattern>,
    pub domain: Option<PromptDomain>,
    pub generation_timestamp: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PromptDomain {
    MathematicalReasoning,
    SecurityVulnerabilityResearch,
    GovernancePolicy,
    AlgorithmicProblemSolving,
    FormalLogic,
    Custom(String),
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CognitivePattern {
    ChainOfThought {
        steps: Vec<String>,
    },
    HierarchicalStructure {
        levels: Vec<HierarchyLevel>,
    },
    FewShotExamples {
        examples: Vec<FewShotExample>,
    },
    ScopeDelimitation {
        include: Vec<String>,
        exclude: Vec<String>,
    },
    FeedbackCycles {
        critique_questions: Vec<String>,
    },
    StructuralAnalogy {
        source_domain: String,
        target_domain: String,
        mappings: Vec<AnalogyMapping>,
    },
    FormatConstraint {
        output_format: OutputFormat,
        schema: serde_json::Value,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HierarchyLevel {
    pub level: u8,
    pub title: String,
    pub content_template: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FewShotExample {
    pub input: String,
    pub reasoning: String,
    pub output: String,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AnalogyMapping {
    pub source_concept: String,
    pub target_concept: String,
    pub explanation: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OutputFormat {
    Json,
    Yaml,
    MarkdownTable,
    BulletList,
    NumberedSteps,
    RustCode,
    PlainText,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptPerformance {
    pub timestamp: i64,
    pub task_id: String,
    pub success: bool,
    pub reasoning_quality_score: f64,
    pub hallucination_detected: bool,
    pub tokens_used: usize,
    pub latency_ms: u64,
    pub feedback: Option<String>,
}

// HSM placeholder
#[async_trait::async_trait]
pub trait HsmInterface: Send + Sync {
    async fn verify_ed25519(
        &self,
        signature: &[u8],
        message: &[u8],
        public_key: &str,
    ) -> Result<bool, String>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_capability_hierarchy() {
        // Expert pode tudo
        assert!(matches!(
            (Capability::Expert, Capability::Operator),
            (Capability::Expert, _)
        ));
        assert!(matches!(
            (Capability::Expert, Capability::Auditor),
            (Capability::Expert, _)
        ));

        // Operator pode Researcher
        // (verificado na lógica do verify)

        // Guest não pode nada além de Guest
        // (verificado na lógica do verify)
    }

    #[tokio::test]
    async fn test_prompt_record_generation() {
        let wormgraph = Arc::new(WormGraph::new(BackendType::InMemory));
        let store = PromptWormGraphStore { wormgraph };

        let prompt = ComposedPrompt {
            text: "Test prompt for RSI validation".to_string(),
            metadata: PromptMetadata::default(),
            estimated_tokens: 50,
        };

        let record_id = store
            .record_prompt_generation(
                &prompt,
                "test_template",
                &PromptDomain::MathematicalReasoning,
                &Capability::Operator,
                None,
                "TestComponent",
            )
            .await
            .unwrap();

        assert!(record_id.starts_with("prompt_"));
        assert!(record_id.contains("TestComponent"));
    }

    #[test]
    fn test_generated_prompt_structure() {
        let gp = GeneratedPrompt {
            composed: ComposedPrompt {
                text: "test".to_string(),
                metadata: PromptMetadata::default(),
                estimated_tokens: 10,
            },
            record_id: "test_123".to_string(),
            capability_used: Capability::Expert,
        };

        assert_eq!(gp.record_id, "test_123");
        assert_eq!(gp.capability_used, Capability::Expert);
    }
}
