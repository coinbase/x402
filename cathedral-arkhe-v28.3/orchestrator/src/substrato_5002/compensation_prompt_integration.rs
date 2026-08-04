use crate::substrato_9000::cognitive_router_integration::CognitiveTask;
use sha2::Digest;
use std::collections::HashMap;
// src/substrato_5002/compensation_prompt_integration.rs
// Integração Substrato 4003 (Compensation) + CognitivePromptEngine
// Quando um prompt usado para geração de código de compensação falha,
// registra falha estruturada e propõe correção via RSI
//
// Selo: CATHEDRAL-ARKHE-4003-5002-COMPENSATION-INTEGRATION-2026-06-18
// Arquiteto: ORCID 0009-0005-2697-4668

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;

/// ============================================================
/// 1. COMPENSATION PROMPT INTEGRATOR
/// ============================================================

/// Integrador entre sistema de compensação (4003) e engine de prompts (5002)
pub struct CompensationPromptIntegrator {
    prompt_engine: Arc<RwLock<CognitivePromptEngine>>,
    compensation_engine: Arc<CompensationEngine>,
    wormgraph: Arc<WormGraph>,
    meta_controller: Arc<MetaControllerV23>,
}

/// Registro de falha de compensação vinculada a prompt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompensationPromptFailure {
    pub failure_id: String,
    pub prompt_record_id: String,
    pub compensation_tx_id: String,
    pub failure_type: CompensationFailureType,
    pub error_details: String,
    pub context: CompensationContext,
    pub proposed_recovery: Option<RecoveryProposal>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CompensationFailureType {
    PromptHallucination,       // LLM gerou código de compensação inválido
    PromptScopeViolation,      // Prompt não respeitou delimitação de escopo
    PromptFormatError,         // Saída não seguiu formato exigido
    CompensationExecutionFail, // Código gerado falhou na execução
    Timeout,                   // Prompt ou execução excedeu tempo limite
    SafetyViolation,           // Código gerado violou constraints de segurança
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompensationContext {
    pub original_prompt_text: String,
    pub generated_code: String,
    pub target_blockchain: String,
    pub compensation_amount: String,
    pub sender_address: String,
    pub recipient_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryProposal {
    pub recovery_type: RecoveryType,
    pub description: String,
    pub requires_rsi: bool,
    pub rsi_target: Option<String>,
    pub estimated_risk: RiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RecoveryType {
    PromptRegeneration, // Regenerar prompt com padrões diferentes
    PromptRefinement,   // Refinar prompt existente (mais few-shot, etc.)
    ManualIntervention, // Escalar para operador humano
    FallbackExecution,  // Usar código de compensação fallback
    RsiCodeImprovement, // Acionar RSI para melhorar gerador de código
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

impl CompensationPromptIntegrator {
    pub fn new(
        prompt_engine: Arc<RwLock<CognitivePromptEngine>>,
        compensation_engine: Arc<CompensationEngine>,
        wormgraph: Arc<WormGraph>,
        meta_controller: Arc<MetaControllerV23>,
    ) -> Self {
        Self {
            prompt_engine,
            compensation_engine,
            wormgraph,
            meta_controller,
        }
    }

    /// ============================================================
    /// 1.1 REGISTRO ESTRUTURADO DE FALHA
    /// ============================================================

    /// Registra falha de compensação vinculada ao prompt que a gerou
    pub async fn record_compensation_failure(
        &self,
        prompt_record_id: &str,
        compensation_tx_id: &str,
        failure_type: CompensationFailureType,
        error_details: &str,
        context: CompensationContext,
    ) -> Result<String, CompensationError> {
        let failure_id = format!(
            "comp_fail_{}_{}",
            compensation_tx_id,
            Utc::now().timestamp_millis()
        );

        // 1. Analisa falha e propõe recovery
        let recovery = self
            .analyze_failure_and_propose_recovery(&failure_type, error_details, &context)
            .await?;

        let failure_record = CompensationPromptFailure {
            failure_id: failure_id.clone(),
            prompt_record_id: prompt_record_id.to_string(),
            compensation_tx_id: compensation_tx_id.to_string(),
            failure_type: failure_type.clone(),
            error_details: error_details.to_string(),
            context,
            proposed_recovery: Some(recovery.clone()),
            timestamp: Utc::now().timestamp(),
        };

        // 2. Persiste no WormGraph como RecordType::CompensationFailure
        let node = WormGraphNode {
            id: failure_id.clone(),
            record_type: RecordType::CompensationFailure,
            data: serde_json::to_value(&failure_record)
                .map_err(|e| CompensationError::Serialization(e.to_string()))?,
            timestamp: Utc::now().timestamp_millis() as u64,
            signatures: vec![],
        };

        self.wormgraph
            .store(node, None)
            .await
            .map_err(|e| CompensationError::WormGraph(e.to_string()))?;

        // 3. Atualiza performance do prompt engine (penaliza padrões usados)
        self.penalize_prompt_patterns(prompt_record_id, &failure_type)
            .await?;

        // 4. Se recovery requer RSI, aciona Meta-Controller
        if recovery.requires_rsi {
            if let Some(target) = &recovery.rsi_target {
                tracing::info!(
                    "🔄 Acionando RSI para recovery de compensação: target={}",
                    target
                );

                // Cria tarefa cognitiva para RSI
                let rsi_task = CognitiveTask {
                    id: format!("rsi_comp_recovery_{}", failure_id),
                    task_type: crate::substrato_9000::cognitive_router_integration::CognitiveTaskType::Custom("compensation_recovery".to_string()),
                    objective: format!("Corrigir gerador de compensação após falha: {}", failure_id),
                    constraints: vec![
                        format!("Falha: {:?}", failure_type),
                        format!("Detalhes: {}", error_details),
                        "Manter compatibilidade com B20/XRPL".to_string(),
                    ],
                    priority: 0.95,
                    deadline: Some(Utc::now().timestamp() + 3600),
                    metadata: {
                        let mut m = HashMap::new();
                        m.insert("failure_id".to_string(), failure_id.clone());
                        m.insert("compensation_tx_id".to_string(), compensation_tx_id.to_string());
                        m
                    },
                };

                // Em produção: envia para Meta-Controller
                tracing::info!("📋 RSI task created: {}", rsi_task.id);
            }
        }

        tracing::info!(
            "❌ Compensation failure recorded: {} (type={:?}, recovery={:?})",
            failure_id,
            failure_type,
            recovery.recovery_type
        );

        Ok(failure_id)
    }

    /// ============================================================
    /// 1.2 ANÁLISE DE FALHA E RECOVERY
    /// ============================================================

    async fn analyze_failure_and_propose_recovery(
        &self,
        failure_type: &CompensationFailureType,
        _error_details: &str,
        _context: &CompensationContext,
    ) -> Result<RecoveryProposal, CompensationError> {
        match failure_type {
            CompensationFailureType::PromptHallucination => Ok(RecoveryProposal {
                recovery_type: RecoveryType::PromptRegeneration,
                description: "Regenerar prompt com mais few-shot examples e CoT explícito"
                    .to_string(),
                requires_rsi: false,
                rsi_target: None,
                estimated_risk: RiskLevel::Low,
            }),
            CompensationFailureType::PromptScopeViolation => Ok(RecoveryProposal {
                recovery_type: RecoveryType::PromptRefinement,
                description: "Adicionar ScopeDelimitation mais rigoroso ao prompt".to_string(),
                requires_rsi: false,
                rsi_target: None,
                estimated_risk: RiskLevel::Low,
            }),
            CompensationFailureType::PromptFormatError => Ok(RecoveryProposal {
                recovery_type: RecoveryType::PromptRefinement,
                description: "Reforçar FormatConstraint com schema JSON estrito".to_string(),
                requires_rsi: false,
                rsi_target: None,
                estimated_risk: RiskLevel::Low,
            }),
            CompensationFailureType::CompensationExecutionFail => {
                // Falha de execução pode indicar bug no gerador de código
                Ok(RecoveryProposal {
                    recovery_type: RecoveryType::RsiCodeImprovement,
                    description: "Acionar RSI para melhorar gerador de código de compensação"
                        .to_string(),
                    requires_rsi: true,
                    rsi_target: Some("compensation_code_generator".to_string()),
                    estimated_risk: RiskLevel::Medium,
                })
            }
            CompensationFailureType::Timeout => Ok(RecoveryProposal {
                recovery_type: RecoveryType::FallbackExecution,
                description: "Usar código de compensação pré-validado (fallback)".to_string(),
                requires_rsi: false,
                rsi_target: None,
                estimated_risk: RiskLevel::Medium,
            }),
            CompensationFailureType::SafetyViolation => {
                // Violação de segurança é crítica — requer RSI + auditoria
                Ok(RecoveryProposal {
                    recovery_type: RecoveryType::RsiCodeImprovement,
                    description:
                        "Acionar RSI com validação Skeptic reforçada + auditoria de segurança"
                            .to_string(),
                    requires_rsi: true,
                    rsi_target: Some("compensation_safety_engine".to_string()),
                    estimated_risk: RiskLevel::Critical,
                })
            }
        }
    }

    /// ============================================================
    /// 1.3 PENALIZAÇÃO DE PADRÕES NO PROMPT ENGINE
    /// ============================================================

    async fn penalize_prompt_patterns(
        &self,
        prompt_record_id: &str,
        failure_type: &CompensationFailureType,
    ) -> Result<(), CompensationError> {
        // Em produção: recuperar o prompt do WormGraph e identificar padrões usados
        // Aqui: simula penalização baseada no tipo de falha

        let penalty = match failure_type {
            CompensationFailureType::PromptHallucination => 0.3,
            CompensationFailureType::PromptScopeViolation => 0.4,
            CompensationFailureType::PromptFormatError => 0.2,
            CompensationFailureType::CompensationExecutionFail => 0.5,
            CompensationFailureType::Timeout => 0.1,
            CompensationFailureType::SafetyViolation => 0.8,
        };

        tracing::warn!(
            "📉 Penalizando padrões do prompt {} com penalty={:.2} (failure={:?})",
            prompt_record_id,
            penalty,
            failure_type
        );

        // Em produção: atualizar ThompsonBandit com recompensa negativa
        // let mut engine = self.prompt_engine.write().await;
        // engine.record_penalty(prompt_record_id, penalty);

        Ok(())
    }

    /// ============================================================
    /// 1.4 GERAÇÃO DE PROMPT DE COMPENSAÇÃO OTIMIZADO
    /// ============================================================

    /// Gera prompt para código de compensação com proteções adicionais
    pub async fn generate_compensation_prompt(
        &self,
        compensation_request: &CompensationRequest,
        caller_token: &CapabilityToken,
    ) -> Result<GeneratedPromptV3, CompensationError> {
        let engine = self.prompt_engine.read().await;

        // Verifica capacidade
        if caller_token.capability != Capability::Expert
            && caller_token.capability != Capability::Operator
        {
            return Err(CompensationError::CapabilityDenied(format!(
                "Compensation generation requires Operator+, got {:?}",
                caller_token.capability
            )));
        }

        let task = TaskDescription {
            description: format!(
                "Gerar código de compensação para transação {} na blockchain {}",
                compensation_request.tx_id, compensation_request.blockchain
            ),
            constraints: vec![
                format!(
                    "Montante: {} {}",
                    compensation_request.amount, compensation_request.asset
                ),
                format!("Remetente: {}", compensation_request.sender),
                format!("Destinatário: {}", compensation_request.recipient),
                "Compatível com B20/XRPL standards".to_string(),
                "Incluir rollback automático em caso de falha".to_string(),
                "Validar saldo antes de execução".to_string(),
                "Gerar prova de execução (TensorZKP)".to_string(),
            ],
            priority: 0.95, // Compensação é alta prioridade
        };

        let composed = engine
            .compose_prompt(
                &task,
                Some(PromptDomain::Custom("compensation".to_string())),
            )
            .map_err(|e| CompensationError::PromptEngine(e.to_string()))?;

        let record_id = format!(
            "comp_prompt_{}_{}",
            compensation_request.tx_id,
            Utc::now().timestamp_millis()
        );

        // Registra no WormGraph
        let node = WormGraphNode {
            id: record_id.clone(),
            record_type: RecordType::CompensationPrompt,
            data: serde_json::json!({
                "record_id": record_id,
                "tx_id": compensation_request.tx_id,
                "prompt_hash": hex::encode(&sha2::Sha256::digest(composed.text.as_bytes())[..8]),
                "patterns_used": composed.metadata.patterns_used.iter().map(|p| format!("{:?}", p)).collect::<Vec<_>>(),
                "caller": caller_token.holder_id.clone(),
                "timestamp": Utc::now().timestamp(),
            }),
            timestamp: Utc::now().timestamp_millis() as u64,
            signatures: vec![],
        };

        self.wormgraph
            .store(node, None)
            .await
            .map_err(|e| CompensationError::WormGraph(e.to_string()))?;

        Ok(GeneratedPromptV3 {
            composed,
            record_id,
            capability_used: caller_token.capability.clone(),
            task_type: CognitiveTaskType::Custom("compensation".to_string()),
        })
    }
}

/// ============================================================
/// 2. TIPOS DE DOMÍNIO
/// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompensationRequest {
    pub tx_id: String,
    pub blockchain: String,
    pub amount: String,
    pub asset: String,
    pub sender: String,
    pub recipient: String,
    pub reason: String,
    pub deadline: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompensationEngine;

#[derive(Debug, Error)]
pub enum CompensationError {
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("WormGraph error: {0}")]
    WormGraph(String),
    #[error("Prompt engine error: {0}")]
    PromptEngine(String),
    #[error("Capability denied: {0}")]
    CapabilityDenied(String),
    #[error("Meta-Controller error: {0}")]
    MetaController(String),
}

// Placeholder types
#[derive(Debug, Clone)]
pub struct CognitivePromptEngine;
impl CognitivePromptEngine {
    pub fn compose_prompt(
        &self,
        _task: &TaskDescription,
        _domain: Option<PromptDomain>,
    ) -> Result<ComposedPrompt, String> {
        Ok(ComposedPrompt {
            text: "test".to_string(),
            metadata: PromptMetadata::default(),
            estimated_tokens: 100,
        })
    }
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
pub struct TaskDescription {
    pub description: String,
    pub constraints: Vec<String>,
    pub priority: f64,
}
#[derive(Debug, Clone)]
pub struct GeneratedPromptV3 {
    pub composed: ComposedPrompt,
    pub record_id: String,
    pub capability_used: Capability,
    pub task_type: CognitiveTaskType,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CognitiveTaskType {
    Planning,
    CodeGeneration,
    SecurityAudit,
    GovernanceReview,
    DataAnalysis,
    ToolExecution,
    Reflection,
    Custom(String),
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Capability {
    Expert,
    Operator,
    Auditor,
    Researcher,
    Guest,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityToken {
    pub token_id: String,
    pub holder_id: String,
    pub capability: Capability,
    pub expiry: i64,
    pub issued_by: String,
    pub signature: Vec<u8>,
}
#[derive(Debug, Clone)]
pub struct MetaControllerV23;
#[derive(Debug, Clone)]
pub struct WormGraph;
impl WormGraph {
    pub async fn store(&self, _n: WormGraphNode, _o: Option<()>) -> Result<(), String> {
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
    CompensationFailure,
    CompensationPrompt,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[tokio::test]
    async fn test_failure_analysis() {
        let integrator = create_test_integrator().await;

        let context = CompensationContext {
            original_prompt_text: "Generate compensation code".to_string(),
            generated_code: "invalid code".to_string(),
            target_blockchain: "XRPL".to_string(),
            compensation_amount: "100.0".to_string(),
            sender_address: "rSender".to_string(),
            recipient_address: "rRecipient".to_string(),
        };

        let recovery = integrator
            .analyze_failure_and_propose_recovery(
                &CompensationFailureType::CompensationExecutionFail,
                "Execution reverted: insufficient balance",
                &context,
            )
            .await
            .unwrap();

        assert_eq!(recovery.recovery_type, RecoveryType::RsiCodeImprovement);
        assert!(recovery.requires_rsi);
        assert_eq!(
            recovery.rsi_target,
            Some("compensation_code_generator".to_string())
        );
        assert_eq!(recovery.estimated_risk, RiskLevel::Medium);
    }

    #[tokio::test]
    async fn test_safety_failure_recovery() {
        let integrator = create_test_integrator().await;

        let context = CompensationContext {
            original_prompt_text: "Generate compensation code".to_string(),
            generated_code: "unsafe code".to_string(),
            target_blockchain: "Ethereum".to_string(),
            compensation_amount: "1000.0".to_string(),
            sender_address: "0xSender".to_string(),
            recipient_address: "0xRecipient".to_string(),
        };

        let recovery = integrator
            .analyze_failure_and_propose_recovery(
                &CompensationFailureType::SafetyViolation,
                "Generated code contains reentrancy vulnerability",
                &context,
            )
            .await
            .unwrap();

        assert_eq!(recovery.recovery_type, RecoveryType::RsiCodeImprovement);
        assert!(recovery.requires_rsi);
        assert_eq!(recovery.estimated_risk, RiskLevel::Critical);
    }

    #[tokio::test]
    async fn test_compensation_prompt_generation() {
        let integrator = create_test_integrator().await;

        let request = CompensationRequest {
            tx_id: "tx_123".to_string(),
            blockchain: "XRPL".to_string(),
            amount: "100.0".to_string(),
            asset: "B20".to_string(),
            sender: "rSender".to_string(),
            recipient: "rRecipient".to_string(),
            reason: "Failed swap".to_string(),
            deadline: Utc::now().timestamp() + 3600,
        };

        let token = CapabilityToken {
            token_id: "test".to_string(),
            holder_id: "ORCID".to_string(),
            capability: Capability::Expert,
            expiry: Utc::now().timestamp() + 3600,
            issued_by: "Council".to_string(),
            signature: vec![0u8; 64],
        };

        let prompt = integrator
            .generate_compensation_prompt(&request, &token)
            .await
            .unwrap();

        assert!(prompt.composed.text.contains("test"));
        assert_eq!(prompt.record_id.starts_with("comp_prompt_"), true);
    }

    async fn create_test_integrator() -> CompensationPromptIntegrator {
        CompensationPromptIntegrator::new(
            Arc::new(RwLock::new(CognitivePromptEngine)),
            Arc::new(CompensationEngine),
            Arc::new(WormGraph),
            Arc::new(MetaControllerV23),
        )
    }
}
