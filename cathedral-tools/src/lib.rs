// Mock for cathedral-tools
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub role: String,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

pub struct ToolContext {
    pub path: String,
}
impl ToolContext {
    pub fn new(path: String) -> Self { Self { path } }
}

pub struct SessionManager {}
impl SessionManager {
    pub fn new(_size: usize) -> Self { Self {} }
    pub async fn get_session(&self, _id: &str) -> Option<SessionData> {
        Some(SessionData { history: vec![] })
    }
    pub async fn append_message(&self, _id: &str, _msg: AgentMessage) {}
    pub async fn create_session(&self, _id: &str, _ctx: std::sync::Arc<ToolContext>) {}
}

pub struct SessionData {
    pub history: Vec<AgentMessage>,
}
