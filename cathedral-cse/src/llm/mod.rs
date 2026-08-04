//! src/llm/mod.rs
//! Trait centralizado para LlmClient, evitando duplicação.

use std::sync::Arc;
use async_trait::async_trait;
use cathedral_tools::AgentMessage;

#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn chat_completion(&self, messages: &[AgentMessage], tools: Option<serde_json::Value>) -> Result<String, String>;
    async fn chat_completion_stream(
        &self,
        messages: &[AgentMessage],
        tools: Option<serde_json::Value>,
    ) -> Result<Box<dyn futures::Stream<Item = Result<String, String>> + Send + Sync>, String>;

    /// Clone em Arc
    fn clone_arc(&self) -> Arc<dyn LlmClient + Send + Sync>;
}
