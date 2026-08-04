use std::sync::Arc;
use tokio::sync::Mutex;
use std::fs;

// Assuming config structures are defined in config_loader.rs
// use crate::config_loader::{AgentConfigFile, PlanningConfig, TrustConfig};

#[derive(Debug, Clone)]
pub struct OrchestratorError(pub String);

impl OrchestratorError {
    pub fn InvalidTask(msg: String) -> Self {
        OrchestratorError(msg)
    }
}

// Stub structures for the purpose of this implementation
pub struct SphincsSigner {}
impl SphincsSigner {
    pub fn new() -> Self {
        SphincsSigner {}
    }
}

pub struct MultiAgentOrchestrator {
    event_bus: Option<Arc<Mutex<String>>>, // Stub for event bus
    signer: Arc<SphincsSigner>,
    pub memory_config: serde_json::Value, // Stub for config
    pub trust_config: serde_json::Value, // Stub for config
    pub planning_config: serde_json::Value, // Stub for config
    pub agent_id: String,
    pub model_id: Option<String>,
}

impl MultiAgentOrchestrator {
    pub fn new(event_bus: Option<Arc<Mutex<String>>>, signer: Arc<SphincsSigner>) -> Self {
        MultiAgentOrchestrator {
            event_bus,
            signer,
            memory_config: serde_json::Value::Null,
            trust_config: serde_json::Value::Null,
            planning_config: serde_json::Value::Null,
            agent_id: String::from("default_agent"),
            model_id: None,
        }
    }

    /// Creates a new MultiAgentOrchestrator by loading configuration files
    pub async fn new_with_config(
        config_path: &str,
        manifest_path: &str,
    ) -> Result<Self, OrchestratorError> {
        // We'll use dummy event_bus and signer for this constructor
        let signer = Arc::new(SphincsSigner::new());
        let event_bus = None;

        let mut orchestrator = Self::new(event_bus, signer);

        // 1. Load config.yaml
        let config_content = fs::read_to_string(config_path)
            .map_err(|e| OrchestratorError::InvalidTask(format!("Failed to read config file {}: {}", config_path, e)))?;

        let agent_config: serde_yaml::Value = serde_yaml::from_str(&config_content)
            .map_err(|e| OrchestratorError::InvalidTask(format!("Failed to parse config YAML: {}", e)))?;

        // Extract settings
        if let Some(agent) = agent_config.get("agent") {
            if let Some(id) = agent.get("id").and_then(|i| i.as_str()) {
                orchestrator.agent_id = id.to_string();
                println!("Loaded Agent ID: {}", orchestrator.agent_id);
            }

            if let Some(planning) = agent.get("planning") {
                orchestrator.planning_config = serde_json::to_value(planning).unwrap_or(serde_json::Value::Null);

                // Apply planning strategies
                if let Some(strategy) = planning.get("strategy").and_then(|s| s.as_str()) {
                    println!("Applying planning strategy: {}", strategy);
                }
                if let Some(consensus_mode) = planning.get("consensus_mode").and_then(|c| c.as_str()) {
                    println!("Applying consensus mode: {}", consensus_mode);
                }
            }

            if let Some(trust) = agent.get("trust") {
                orchestrator.trust_config = serde_json::to_value(trust).unwrap_or(serde_json::Value::Null);

                // Apply trust policies
                if let Some(require_memory_proof) = trust.get("require_memory_proof").and_then(|r| r.as_bool()) {
                    println!("Require Memory Proof: {}", require_memory_proof);
                }
                if let Some(require_spex) = trust.get("require_spex").and_then(|r| r.as_bool()) {
                    println!("Require SPEX: {}", require_spex);
                }
            }

            if let Some(memory) = agent.get("memory") {
                orchestrator.memory_config = serde_json::to_value(memory).unwrap_or(serde_json::Value::Null);
            }
        }

        // 2. Load manifest.json
        if let Ok(manifest_content) = fs::read_to_string(manifest_path) {
            if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&manifest_content) {
                if let Some(model_id) = manifest.get("model_id").and_then(|m| m.as_str()) {
                    orchestrator.model_id = Some(model_id.to_string());
                    println!("Loaded Model ID from Manifest: {}", model_id);
                }
            }
        } else {
            println!("Warning: Could not read manifest at {}", manifest_path);
        }

        Ok(orchestrator)
    }
}
