// src/substrato_9000/cognitive_router_integration.rs
// Substrato 9000 — Cognitive Router integrado com CognitivePromptEngine (5002 v2.2)
// Unifica planejamento ReAct (9000) com engenharia de prompt otimizada (5002)
//
// Selo: CATHEDRAL-ARKHE-9000-5002-UNIFIED-COGNITIVE-2026-06-18
// Arquiteto: ORCID 0009-0005-2697-4668

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;

/// ============================================================
/// 1. COGNITIVE ROUTER v3.0 — Unificado com Prompt Engine
/// ============================================================

/// Router cognitivo que orquestra ReAct + prompts otimizados
pub struct CognitiveRouterV3 {
    /// Motor de planejamento ReAct (Substrato 9000)
    react_engine: Arc<ReActEngine>,
    /// Motor de engenharia de prompt (Substrato 5002 v2.2)
    prompt_engine: Arc<RwLock<CognitivePromptEngine>>,
    /// Registro de ferramentas disponíveis
    tool_registry: Arc<ToolRegistry>,
    /// Memória episódica
    episodic_memory: Arc<EpisodicMemoryStore>,
    /// Memória semântica (zVEC)
    semantic_memory: Arc<SemanticMemoryStore>,
    /// Verificador de capacidades
    capability_verifier: Arc<CapabilityVerifier>,
    /// Persistência no WormGraph
    wormgraph: Arc<WormGraph>,
}

impl CognitiveRouterV3 {
    pub fn new(
        react_engine: Arc<ReActEngine>,
        prompt_engine: Arc<RwLock<CognitivePromptEngine>>,
        tool_registry: Arc<ToolRegistry>,
        episodic_memory: Arc<EpisodicMemoryStore>,
        semantic_memory: Arc<SemanticMemoryStore>,
        capability_verifier: Arc<CapabilityVerifier>,
        wormgraph: Arc<WormGraph>,
    ) -> Self {
        Self {
            react_engine,
            prompt_engine,
            tool_registry,
            episodic_memory,
            semantic_memory,
            capability_verifier,
            wormgraph,
        }
    }

    /// ============================================================
    /// 1.1 EXECUÇÃO DE TAREFA COGNITIVA UNIFICADA
    /// ============================================================

    /// Executa uma tarefa cognitiva completa: planejamento + execução + reflexão
    pub async fn execute_cognitive_task(
        &self,
        task: CognitiveTask,
        caller_token: &CapabilityToken,
    ) -> Result<CognitiveTaskResult, CognitiveRouterError> {
        let start_time = Utc::now().timestamp_millis();

        tracing::info!(
            "🧠 CognitiveTask started: {} (type={:?})",
            task.id,
            task.task_type
        );

        // 1. VERIFICA CAPACIDADE
        let required_capability = self.task_type_to_capability(&task.task_type);
        self.capability_verifier
            .verify(caller_token, required_capability)
            .await
            .map_err(|e| CognitiveRouterError::CapabilityDenied(e.to_string()))?;

        // 2. RECUPERA MEMÓRIAS RELEVANTES
        let memories = self.retrieve_relevant_memories(&task).await?;
        tracing::info!("💾 Retrieved {} relevant memories", memories.len());

        // 3. MAPEIA TIPO DE TAREFA → DOMÍNIO DO PROMPT ENGINE
        let prompt_domain = self.task_type_to_prompt_domain(&task.task_type);

        // 4. GERA PROMPT OTIMIZADO PARA PLANEJAMENTO
        let plan_prompt = self
            .generate_planning_prompt(&task, &memories, prompt_domain.clone(), caller_token)
            .await?;

        // 5. EXECUTA PLANEJAMENTO ReAct COM PROMPT OTIMIZADO
        let plan = self
            .react_engine
            .plan(&plan_prompt.composed.text, &task)
            .await
            .map_err(|e| CognitiveRouterError::PlanningFailed(e.to_string()))?;

        tracing::info!("📋 Plan generated: {} steps", plan.steps.len());

        // 6. REGISTRA PROMPT NO WORMGRAPH
        let prompt_record_id = self
            .record_prompt_in_wormgraph(&plan_prompt, &task, "planning", caller_token)
            .await?;

        // 7. EXECUTA PASSOS DO PLANO
        let mut step_results = Vec::new();
        for (i, step) in plan.steps.iter().enumerate() {
            tracing::info!(
                "▶️  Executing step {}/{}: {}",
                i + 1,
                plan.steps.len(),
                step.description
            );

            let step_prompt = self
                .generate_step_prompt(&task, step, &memories, prompt_domain.clone())
                .await?;
            let result = self.execute_step(&step_prompt, step, caller_token).await?;

            step_results.push(result);
        }

        // 8. REFLEXÃO E AUTO-CRÍTICA
        let reflection_prompt = self
            .generate_reflection_prompt(&task, &plan, &step_results)
            .await?;
        let reflection = self
            .react_engine
            .reflect(&reflection_prompt.composed.text)
            .await
            .map_err(|e| CognitiveRouterError::ReflectionFailed(e.to_string()))?;

        // 9. REGISTRA RESULTADO E ATUALIZA MEMÓRIA
        let result = CognitiveTaskResult {
            task_id: task.id.clone(),
            success: step_results.iter().all(|r| r.success),
            plan,
            step_results,
            reflection,
            prompt_record_id,
            execution_time_ms: (Utc::now().timestamp_millis() - start_time) as u64,
            timestamp: Utc::now().timestamp(),
        };

        self.store_task_result(&result, caller_token).await?;

        // 10. ATUALIZA PERFORMANCE DO PROMPT ENGINE
        self.update_prompt_engine_performance(&plan_prompt, &result)
            .await?;

        tracing::info!(
            "✅ CognitiveTask completed: {} (success={}, time={}ms)",
            task.id,
            result.success,
            result.execution_time_ms
        );

        Ok(result)
    }

    /// ============================================================
    /// 1.2 GERAÇÃO DE PROMPTS ESPECIALIZADOS
    /// ============================================================

    /// Gera prompt otimizado para planejamento ReAct
    async fn generate_planning_prompt(
        &self,
        task: &CognitiveTask,
        memories: &[EpisodicMemory],
        domain: PromptDomain,
        _caller_token: &CapabilityToken,
    ) -> Result<GeneratedPromptV3, CognitiveRouterError> {
        let engine = self.prompt_engine.read().await;

        let task_desc = TaskDescription {
            description: format!(
                "Planeje a execução da tarefa: {} (type={:?})\nObjetivo: {}\nRestrições: {:?}",
                task.id, task.task_type, task.objective, task.constraints
            ),
            constraints: vec![
                format!("Memórias relevantes: {} episódios", memories.len()),
                format!(
                    "Ferramentas disponíveis: {}",
                    self.tool_registry.list_tools().join(", ")
                ),
                "Priorize ferramentas já testadas com sucesso".to_string(),
                "Máximo de 10 passos no plano".to_string(),
            ],
            priority: task.priority,
        };

        let composed = engine
            .compose_prompt(&task_desc, Some(domain))
            .map_err(|e| CognitiveRouterError::PromptEngine(e.to_string()))?;

        let record_id = format!("prompt_plan_{}_{}", task.id, Utc::now().timestamp_millis());

        Ok(GeneratedPromptV3 {
            composed,
            record_id,
            capability_used: self.task_type_to_capability(&task.task_type),
            task_type: task.task_type.clone(),
        })
    }

    /// Gera prompt para execução de um passo específico
    async fn generate_step_prompt(
        &self,
        task: &CognitiveTask,
        step: &PlanStep,
        _memories: &[EpisodicMemory],
        domain: PromptDomain,
    ) -> Result<GeneratedPromptV3, CognitiveRouterError> {
        let engine = self.prompt_engine.read().await;

        let tool_info = self
            .tool_registry
            .get_tool(&step.tool_name)
            .map(|t| format!("{}: {}", t.name, t.description))
            .unwrap_or_else(|| "Tool not found".to_string());

        let task_desc = TaskDescription {
            description: format!(
                "Execute o passo: {}\nFerramenta: {}\nParâmetros: {:?}",
                step.description, step.tool_name, step.parameters
            ),
            constraints: vec![
                format!("Tool info: {}", tool_info),
                "Valide parâmetros antes de executar".to_string(),
                "Registre resultado estruturado".to_string(),
            ],
            priority: task.priority,
        };

        let composed = engine
            .compose_prompt(&task_desc, Some(domain))
            .map_err(|e| CognitiveRouterError::PromptEngine(e.to_string()))?;

        let record_id = format!("prompt_step_{}_{}", task.id, step.id);

        Ok(GeneratedPromptV3 {
            composed,
            record_id,
            capability_used: Capability::Operator,
            task_type: task.task_type.clone(),
        })
    }

    /// Gera prompt para reflexão pós-execução
    async fn generate_reflection_prompt(
        &self,
        task: &CognitiveTask,
        _plan: &ExecutionPlan,
        step_results: &[StepResult],
    ) -> Result<GeneratedPromptV3, CognitiveRouterError> {
        let engine = self.prompt_engine.read().await;

        let success_count = step_results.iter().filter(|r| r.success).count();
        let _failure_count = step_results.len() - success_count;

        let task_desc = TaskDescription {
            description: format!(
                "Reflexão pós-execução da tarefa: {}\nResultado: {}/{} passos bem-sucedidos",
                task.id,
                success_count,
                step_results.len()
            ),
            constraints: vec![
                "Identifique falhas e lições aprendidas".to_string(),
                "Sugira melhorias para execuções futuras".to_string(),
                "Avalie qualidade do plano inicial".to_string(),
            ],
            priority: 0.8,
        };

        let composed = engine
            .compose_prompt(&task_desc, Some(PromptDomain::GovernancePolicy))
            .map_err(|e| CognitiveRouterError::PromptEngine(e.to_string()))?;

        let record_id = format!("prompt_refl_{}_{}", task.id, Utc::now().timestamp_millis());

        Ok(GeneratedPromptV3 {
            composed,
            record_id,
            capability_used: Capability::Auditor,
            task_type: CognitiveTaskType::Reflection,
        })
    }

    /// ============================================================
    /// 1.3 EXECUÇÃO E PERSISTÊNCIA
    /// ============================================================

    async fn execute_step(
        &self,
        prompt: &GeneratedPromptV3,
        step: &PlanStep,
        caller_token: &CapabilityToken,
    ) -> Result<StepResult, CognitiveRouterError> {
        // Recupera ferramenta
        let tool = self
            .tool_registry
            .get_tool(&step.tool_name)
            .ok_or_else(|| CognitiveRouterError::ToolNotFound(step.tool_name.clone()))?;

        // Verifica se ferramenta requer capacidade adicional
        if let Some(required) = &tool.required_capability {
            self.capability_verifier
                .verify(caller_token, required.clone())
                .await
                .map_err(|e| {
                    CognitiveRouterError::CapabilityDenied(format!(
                        "Tool '{}' requires {:?}: {}",
                        step.tool_name, required, e
                    ))
                })?;
        }

        // Executa ferramenta com prompt otimizado
        let result = tool
            .execute(&step.parameters, &prompt.composed.text)
            .await
            .map_err(|e| CognitiveRouterError::ToolExecutionFailed {
                tool: step.tool_name.clone(),
                error: e.to_string(),
            })?;

        Ok(StepResult {
            step_id: step.id.clone(),
            success: result.success,
            output: result.output,
            execution_time_ms: result.execution_time_ms,
            prompt_record_id: prompt.record_id.clone(),
        })
    }

    async fn record_prompt_in_wormgraph(
        &self,
        prompt: &GeneratedPromptV3,
        task: &CognitiveTask,
        phase: &str,
        caller_token: &CapabilityToken,
    ) -> Result<String, CognitiveRouterError> {
        let prompt_hash: [u8; 32] = sha2::Sha256::digest(prompt.composed.text.as_bytes()).into();

        let record = serde_json::json!({
            "record_id": prompt.record_id,
            "task_id": task.id,
            "phase": phase,
            "prompt_hash": hex::encode(&prompt_hash[..8]),
            "patterns_used": prompt.composed.metadata.patterns_used.iter()
                .map(|p| format!("{:?}", p))
                .collect::<Vec<_>>(),
            "domain": format!("{:?}", prompt.composed.metadata.domain),
            "capability": format!("{:?}", prompt.capability_used),
            "caller": caller_token.holder_id.clone(),
            "estimated_tokens": prompt.composed.estimated_tokens,
            "timestamp": Utc::now().timestamp(),
        });

        let node = WormGraphNode {
            id: prompt.record_id.clone(),
            record_type: RecordType::PromptGeneration,
            data: record,
            timestamp: Utc::now().timestamp_millis() as u64,
            signatures: vec![],
        };

        self.wormgraph
            .store(node, None)
            .await
            .map_err(|e| CognitiveRouterError::WormGraph(e.to_string()))?;

        Ok(prompt.record_id.clone())
    }

    async fn store_task_result(
        &self,
        result: &CognitiveTaskResult,
        caller_token: &CapabilityToken,
    ) -> Result<(), CognitiveRouterError> {
        // Persiste no WormGraph
        let node = WormGraphNode {
            id: format!("task_result_{}", result.task_id),
            record_type: RecordType::CognitiveTaskResult,
            data: serde_json::to_value(result)
                .map_err(|e| CognitiveRouterError::Serialization(e.to_string()))?,
            timestamp: Utc::now().timestamp_millis() as u64,
            signatures: vec![hex::encode(&caller_token.signature[..8])],
        };

        self.wormgraph
            .store(node, None)
            .await
            .map_err(|e| CognitiveRouterError::WormGraph(e.to_string()))?;

        // Atualiza memória episódica
        self.episodic_memory
            .store(EpisodicMemory {
                task_id: result.task_id.clone(),
                success: result.success,
                plan_quality: result.reflection.plan_quality_score,
                timestamp: result.timestamp,
            })
            .await
            .map_err(|e| CognitiveRouterError::Memory(e.to_string()))?;

        Ok(())
    }

    async fn update_prompt_engine_performance(
        &self,
        prompt: &GeneratedPromptV3,
        result: &CognitiveTaskResult,
    ) -> Result<(), CognitiveRouterError> {
        let mut engine = self.prompt_engine.write().await;

        let performance = PromptPerformance {
            timestamp: Utc::now().timestamp(),
            task_id: result.task_id.clone(),
            success: result.success,
            reasoning_quality_score: result.reflection.plan_quality_score,
            hallucination_detected: result.reflection.hallucination_detected,
            tokens_used: prompt.composed.estimated_tokens,
            latency_ms: result.execution_time_ms,
            feedback: Some(result.reflection.summary.clone()),
        };

        engine
            .record_performance(&prompt.record_id, performance)
            .map_err(|e| CognitiveRouterError::PromptEngine(e.to_string()))?;

        Ok(())
    }

    /// ============================================================
    /// 1.4 UTILITÁRIOS DE MAPEAMENTO
    /// ============================================================

    fn task_type_to_capability(&self, task_type: &CognitiveTaskType) -> Capability {
        match task_type {
            CognitiveTaskType::Planning => Capability::Expert,
            CognitiveTaskType::CodeGeneration => Capability::Expert,
            CognitiveTaskType::SecurityAudit => Capability::Auditor,
            CognitiveTaskType::GovernanceReview => Capability::Expert,
            CognitiveTaskType::DataAnalysis => Capability::Operator,
            CognitiveTaskType::ToolExecution => Capability::Operator,
            CognitiveTaskType::Reflection => Capability::Auditor,
            CognitiveTaskType::Custom(name) => {
                if name.contains("governance") || name.contains("policy") {
                    Capability::Expert
                } else if name.contains("audit") || name.contains("review") {
                    Capability::Auditor
                } else {
                    Capability::Operator
                }
            }
        }
    }

    fn task_type_to_prompt_domain(&self, task_type: &CognitiveTaskType) -> PromptDomain {
        match task_type {
            CognitiveTaskType::Planning => PromptDomain::GovernancePolicy,
            CognitiveTaskType::CodeGeneration => PromptDomain::MathematicalReasoning,
            CognitiveTaskType::SecurityAudit => PromptDomain::SecurityVulnerabilityResearch,
            CognitiveTaskType::GovernanceReview => PromptDomain::GovernancePolicy,
            CognitiveTaskType::DataAnalysis => PromptDomain::Custom("data_analysis".to_string()),
            CognitiveTaskType::ToolExecution => PromptDomain::Custom("tool_execution".to_string()),
            CognitiveTaskType::Reflection => PromptDomain::GovernancePolicy,
            CognitiveTaskType::Custom(name) => PromptDomain::Custom(name.clone()),
        }
    }

    async fn retrieve_relevant_memories(
        &self,
        task: &CognitiveTask,
    ) -> Result<Vec<EpisodicMemory>, CognitiveRouterError> {
        // Busca memórias similares via zVEC
        let query = format!("{:?} {}", task.task_type, task.objective);
        let memories = self
            .semantic_memory
            .search(&query, 5)
            .await
            .map_err(|e| CognitiveRouterError::Memory(e.to_string()))?;

        Ok(memories)
    }
}

/// ============================================================
/// 2. TIPOS DE DOMÍNIO
/// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveTask {
    pub id: String,
    pub task_type: CognitiveTaskType,
    pub objective: String,
    pub constraints: Vec<String>,
    pub priority: f64,
    pub deadline: Option<i64>,
    pub metadata: HashMap<String, String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveTaskResult {
    pub task_id: String,
    pub success: bool,
    pub plan: ExecutionPlan,
    pub step_results: Vec<StepResult>,
    pub reflection: ReflectionResult,
    pub prompt_record_id: String,
    pub execution_time_ms: u64,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlan {
    pub steps: Vec<PlanStep>,
    pub estimated_cost: f64,
    pub risk_level: RiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: String,
    pub description: String,
    pub tool_name: String,
    pub parameters: HashMap<String, String>,
    pub depends_on: Vec<String>,
    pub estimated_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step_id: String,
    pub success: bool,
    pub output: String,
    pub execution_time_ms: u64,
    pub prompt_record_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflectionResult {
    pub summary: String,
    pub plan_quality_score: f64,
    pub hallucination_detected: bool,
    pub lessons_learned: Vec<String>,
    pub suggested_improvements: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone)]
pub struct GeneratedPromptV3 {
    pub composed: ComposedPrompt,
    pub record_id: String,
    pub capability_used: Capability,
    pub task_type: CognitiveTaskType,
}

#[derive(Debug, Error)]
pub enum CognitiveRouterError {
    #[error("Capability denied: {0}")]
    CapabilityDenied(String),
    #[error("Prompt engine error: {0}")]
    PromptEngine(String),
    #[error("Planning failed: {0}")]
    PlanningFailed(String),
    #[error("Reflection failed: {0}")]
    ReflectionFailed(String),
    #[error("Tool not found: {0}")]
    ToolNotFound(String),
    #[error("Tool execution failed ({tool}): {error}")]
    ToolExecutionFailed { tool: String, error: String },
    #[error("WormGraph error: {0}")]
    WormGraph(String),
    #[error("Memory error: {0}")]
    Memory(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
}

// Placeholder types
#[derive(Debug, Clone)]
pub struct ReActEngine;
impl ReActEngine {
    pub async fn plan(
        &self,
        _prompt: &str,
        _task: &CognitiveTask,
    ) -> Result<ExecutionPlan, String> {
        Ok(ExecutionPlan {
            steps: vec![],
            estimated_cost: 0.0,
            risk_level: RiskLevel::Low,
        })
    }
    pub async fn reflect(&self, _prompt: &str) -> Result<ReflectionResult, String> {
        Ok(ReflectionResult {
            summary: "ok".to_string(),
            plan_quality_score: 0.9,
            hallucination_detected: false,
            lessons_learned: vec![],
            suggested_improvements: vec![],
        })
    }
}
#[derive(Debug, Clone)]
pub struct ToolRegistry;
impl ToolRegistry {
    pub fn list_tools(&self) -> Vec<String> {
        vec!["search".to_string(), "calc".to_string()]
    }
    pub fn get_tool(&self, name: &str) -> Option<Tool> {
        Some(Tool {
            name: name.to_string(),
            description: "test".to_string(),
            required_capability: None,
        })
    }
}
#[derive(Debug, Clone)]
pub struct Tool {
    pub name: String,
    pub description: String,
    pub required_capability: Option<Capability>,
}
impl Tool {
    pub async fn execute(
        &self,
        _params: &HashMap<String, String>,
        _prompt: &str,
    ) -> Result<ToolResult, String> {
        Ok(ToolResult {
            success: true,
            output: "ok".to_string(),
            execution_time_ms: 100,
        })
    }
}
#[derive(Debug, Clone)]
pub struct ToolResult {
    pub success: bool,
    pub output: String,
    pub execution_time_ms: u64,
}
#[derive(Debug, Clone)]
pub struct EpisodicMemoryStore;
impl EpisodicMemoryStore {
    pub async fn store(&self, _m: EpisodicMemory) -> Result<(), String> {
        Ok(())
    }
}
#[derive(Debug, Clone)]
pub struct EpisodicMemory {
    pub task_id: String,
    pub success: bool,
    pub plan_quality: f64,
    pub timestamp: i64,
}
#[derive(Debug, Clone)]
pub struct SemanticMemoryStore;
impl SemanticMemoryStore {
    pub async fn search(&self, _query: &str, _k: usize) -> Result<Vec<EpisodicMemory>, String> {
        Ok(vec![])
    }
}
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
    pub fn record_performance(
        &mut self,
        _id: &str,
        _perf: PromptPerformance,
    ) -> Result<(), String> {
        Ok(())
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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityToken {
    pub token_id: String,
    pub holder_id: String,
    pub capability: Capability,
    pub expiry: i64,
    pub issued_by: String,
    pub signature: Vec<u8>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Capability {
    Expert,
    Operator,
    Auditor,
    Researcher,
    Guest,
}
#[derive(Debug, Clone)]
pub struct CapabilityVerifier;
impl CapabilityVerifier {
    pub async fn verify(
        &self,
        _token: &CapabilityToken,
        _required: Capability,
    ) -> Result<(), String> {
        Ok(())
    }
}
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
    PromptGeneration,
    CognitiveTaskResult,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_task_type_mapping() {
        let router = create_test_router().await;

        assert_eq!(
            router.task_type_to_capability(&CognitiveTaskType::Planning),
            Capability::Expert
        );
        assert_eq!(
            router.task_type_to_capability(&CognitiveTaskType::SecurityAudit),
            Capability::Auditor
        );
        assert_eq!(
            router.task_type_to_capability(&CognitiveTaskType::ToolExecution),
            Capability::Operator
        );

        assert_eq!(
            router.task_type_to_prompt_domain(&CognitiveTaskType::CodeGeneration),
            PromptDomain::MathematicalReasoning
        );
        assert_eq!(
            router.task_type_to_prompt_domain(&CognitiveTaskType::SecurityAudit),
            PromptDomain::SecurityVulnerabilityResearch
        );
    }

    #[tokio::test]
    async fn test_cognitive_task_execution_structure() {
        let router = create_test_router().await;

        let task = CognitiveTask {
            id: "test_task_1".to_string(),
            task_type: CognitiveTaskType::Planning,
            objective: "Criar plano de deploy seguro".to_string(),
            constraints: vec![
                "Zero downtime".to_string(),
                "Rollback automático".to_string(),
            ],
            priority: 0.9,
            deadline: None,
            metadata: HashMap::new(),
        };

        let token = CapabilityToken {
            token_id: "test_token".to_string(),
            holder_id: "ORCID_0009-0005-2697-4668".to_string(),
            capability: Capability::Expert,
            expiry: Utc::now().timestamp() + 3600,
            issued_by: "GovernanceCouncil".to_string(),
            signature: vec![0u8; 64],
        };

        let result = router.execute_cognitive_task(task, &token).await;
        assert!(result.is_ok());

        let result = result.unwrap();
        assert_eq!(result.task_id, "test_task_1");
        assert!(result.execution_time_ms >= 0);
    }

    async fn create_test_router() -> CognitiveRouterV3 {
        CognitiveRouterV3::new(
            Arc::new(ReActEngine),
            Arc::new(RwLock::new(CognitivePromptEngine)),
            Arc::new(ToolRegistry),
            Arc::new(EpisodicMemoryStore),
            Arc::new(SemanticMemoryStore),
            Arc::new(CapabilityVerifier),
            Arc::new(WormGraph),
        )
    }
}
