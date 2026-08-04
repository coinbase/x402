//! src/task_router.rs
//! Selo: CATHEDRAL-ARKHE-ASI-ROUTER-v1.0.0

use serde_json::Value;

pub enum ExecutionSubstrate {
    Sail(String),       // Query/Job distribuído para dados
    Rovo(String),       // Interface no Jira/Confluence
    AutonomousCore,     // Execução direta no nó atual via Rust/WASM
}

pub struct TaskRouter;

impl TaskRouter {
    /// Inspeciona o payload da tarefa e determina a infraestrutura ideal pós-AGI.
    pub fn determine_substrate(task: &Value) -> ExecutionSubstrate {
        let task_type = task.get("task_type").and_then(|v| v.as_str()).unwrap_or("unknown");
        let requires_data_scan = task.get("requires_analytics").and_then(|v| v.as_bool()).unwrap_or(false);
        let requires_human_consensus = task.get("requires_human_consensus").and_then(|v| v.as_bool()).unwrap_or(false);

        // Se for análise massiva de dados, simulações ou ZK proofs em batch -> Sail (Substrato 7002)
        if requires_data_scan || task_type == "massive_simulation" || task_type == "zk_batch_prove" {
            let query = task.get("query").and_then(|v| v.as_str()).unwrap_or("SELECT * FROM wormgraph");
            return ExecutionSubstrate::Sail(query.to_string());
        }

        // Se precisar abrir issues, ler documentação ou envolver revisão humana -> Rovo (Atlassian)
        if requires_human_consensus || task_type == "document_design" || task_type == "request_cem_review" {
            let action = task.get("action").and_then(|v| v.as_str()).unwrap_or("create_issue");
            return ExecutionSubstrate::Rovo(action.to_string());
        }

        // Padrão: Processamento autônomo no Core Rust
        ExecutionSubstrate::AutonomousCore
    }
}
