//! src/thinking/engine.rs
//! Thinking Engine — Chain-of-Thought, Self-Consistency e preservação de raciocínio.

use std::collections::VecDeque;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use tracing::{debug, warn};

use cathedral_tools::AgentMessage;
use crate::llm::LlmClient;

// ============================================================================
// Thought
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thought {
    pub id: String,
    pub content: String,
    pub step_type: ThoughtType,
    pub confidence: f64,
    pub timestamp: DateTime<Utc>,
    pub parent_id: Option<String>,
    pub children: Vec<String>,
}

impl Thought {
    pub fn new(content: &str, step_type: ThoughtType) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            content: content.to_string(),
            step_type,
            confidence: 0.8,
            timestamp: Utc::now(),
            parent_id: None,
            children: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ThoughtType {
    Observation,
    Hypothesis,
    Action,
    Verification,
    Reflection,
    Correction,
    Completion,
}

// ============================================================================
// Comparação de pensamentos (ignorando timestamp e id) — ✅ CSE-HIGH-004
// ============================================================================

fn thoughts_equal(a: &[Thought], b: &[Thought]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| {
        x.step_type == y.step_type && x.content == y.content
    })
}

// ============================================================================
// Thinking Engine
// ============================================================================

pub struct ThinkingEngine {
    current_thoughts: Vec<Thought>,
    history: VecDeque<Vec<Thought>>,
    max_depth: usize,
    thinking_enabled: bool,
    llm_client: Option<Arc<dyn LlmClient + Send + Sync>>,
}

impl ThinkingEngine {
    pub fn new(max_depth: usize) -> Self {
        Self {
            current_thoughts: Vec::new(),
            history: VecDeque::with_capacity(10),
            max_depth,
            thinking_enabled: true,
            llm_client: None,
        }
    }

    pub fn with_llm_client(mut self, client: Arc<dyn LlmClient + Send + Sync>) -> Self {
        self.llm_client = Some(client);
        self
    }

    /// Gera raciocínio com Self-Consistency (paralelo) — ✅ CSE-HIGH-003
    pub async fn reason(&mut self, prompt: &str, num_paths: usize) -> Result<Vec<Thought>, String> {
        if !self.thinking_enabled {
            return Ok(Vec::new());
        }

        let client = self.llm_client.as_ref()
            .ok_or("ThinkingEngine: LlmClient não configurado")?;

        // Gera paths em paralelo
        let futures: Vec<_> = (0..num_paths)
            .map(|_| self.generate_thought_path(prompt, client.clone_arc()))
            .collect();
        let results = futures::future::join_all(futures).await;

        let mut all_thoughts = Vec::with_capacity(num_paths);
        for result in results {
            match result {
                Ok(path) => all_thoughts.push(path),
                Err(e) => warn!("Caminho de raciocínio falhou: {}", e),
            }
        }

        if all_thoughts.is_empty() {
            return Ok(Vec::new());
        }

        // Selecciona o mais consistente
        let most_consistent = self.select_most_consistent(&all_thoughts);
        let mut final_thoughts = most_consistent;

        if self.detect_divergence(&all_thoughts) {
            let reflection = self.generate_reflection(prompt, &final_thoughts, client.clone_arc()).await?;
            final_thoughts.push(reflection);
        }

        self.current_thoughts = final_thoughts.clone();
        self.history.push_back(final_thoughts.clone());
        if self.history.len() > self.max_depth {
            self.history.pop_front();
        }

        debug!("🧠 Thinking: {} pensamentos, {} caminhos", final_thoughts.len(), all_thoughts.len());
        Ok(final_thoughts)
    }

    async fn generate_thought_path(
        &self,
        prompt: &str,
        client: Arc<dyn LlmClient + Send + Sync>,
    ) -> Result<Vec<Thought>, String> {
        let cot_prompt = format!(
            "Resolve o seguinte problema passo a passo. Para cada passo, indica o tipo de pensamento.\n\n\
             Problema: {}\n\n\
             Pensamento 1 (Observation): ",
            prompt
        );
        let messages = vec![AgentMessage {
            role: "user".to_string(),
            content: cot_prompt,
            timestamp: Utc::now(),
        }];
        let response = client.chat_completion(&messages, None).await?;
        let thoughts = self.parse_thoughts(&response);
        if thoughts.is_empty() {
            Ok(vec![Thought::new(&response, ThoughtType::Observation)])
        } else {
            Ok(thoughts)
        }
    }

    fn parse_thoughts(&self, text: &str) -> Vec<Thought> {
        let mut thoughts = Vec::new();
        let mut current_step = Vec::new();
        let mut current_type = ThoughtType::Observation;

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }
            if line.contains("Observation") || line.starts_with("1.") {
                if !current_step.is_empty() {
                    thoughts.push(Thought::new(&current_step.join(" "), current_type.clone()));
                    current_step.clear();
                }
                current_type = ThoughtType::Observation;
                current_step.push(line);
            } else if line.contains("Hypothesis") || line.starts_with("2.") {
                if !current_step.is_empty() {
                    thoughts.push(Thought::new(&current_step.join(" "), current_type.clone()));
                    current_step.clear();
                }
                current_type = ThoughtType::Hypothesis;
                current_step.push(line);
            } else if line.contains("Action") || line.starts_with("3.") {
                if !current_step.is_empty() {
                    thoughts.push(Thought::new(&current_step.join(" "), current_type.clone()));
                    current_step.clear();
                }
                current_type = ThoughtType::Action;
                current_step.push(line);
            } else {
                current_step.push(line);
            }
        }
        if !current_step.is_empty() {
            thoughts.push(Thought::new(&current_step.join(" "), current_type));
        }

        thoughts
    }

    fn select_most_consistent(&self, paths: &[Vec<Thought>]) -> Vec<Thought> {
        paths.iter()
            .max_by(|a, b| {
                let conf_a = a.iter().map(|t| t.confidence).sum::<f64>() / a.len() as f64;
                let conf_b = b.iter().map(|t| t.confidence).sum::<f64>() / b.len() as f64;
                conf_a.partial_cmp(&conf_b).unwrap()
            })
            .cloned()
            .unwrap_or_default()
    }

    fn detect_divergence(&self, paths: &[Vec<Thought>]) -> bool {
        if paths.len() < 2 { return false; }
        let first = &paths[0];
        paths.iter().skip(1).any(|path| !thoughts_equal(first, path))
    }

    async fn generate_reflection(
        &self,
        _prompt: &str,
        thoughts: &[Thought],
        client: Arc<dyn LlmClient + Send + Sync>,
    ) -> Result<Thought, String> {
        let refl_prompt = format!(
            "Reflecte sobre o seguinte raciocínio: {:?}\n\nResumo reflexivo:",
            thoughts
        );
        let messages = vec![AgentMessage {
            role: "user".to_string(),
            content: refl_prompt,
            timestamp: Utc::now(),
        }];
        let response = client.chat_completion(&messages, None).await?;
        Ok(Thought::new(&response, ThoughtType::Reflection))
    }

    pub fn get_thinking_trace(&self) -> &[Thought] {
        &self.current_thoughts
    }

    pub fn serialize_trace(&self) -> Vec<u8> {
        serde_json::to_vec(&self.current_thoughts).unwrap_or_default()
    }

    pub fn restore_trace(&mut self, data: &[u8]) -> Result<(), String> {
        let thoughts: Vec<Thought> = serde_json::from_slice(data)
            .map_err(|e| format!("Falha a restaurar traço: {}", e))?;
        self.current_thoughts = thoughts;
        Ok(())
    }
}
