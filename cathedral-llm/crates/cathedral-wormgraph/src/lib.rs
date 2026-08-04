use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub content: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ExecutionReceipt {
    pub id: String,
}

pub struct WormGraphClient {}

impl WormGraphClient {
    pub fn new() -> Self {
        WormGraphClient {}
    }

    pub async fn get_memories(&self, _did: &str, _limit: usize) -> Result<Vec<MemoryEntry>, String> {
        Ok(vec![])
    }

    pub async fn record(&self, _did: &str, _output: &str, _thinking: &Option<String>, _signature: &[u8]) -> Result<ExecutionReceipt, String> {
        Ok(ExecutionReceipt { id: "receipt_mock".to_string() })
    }

    pub async fn search_similar(&self, _did: &str, _query: &str, _limit: usize) -> Result<Vec<MemoryEntry>, String> {
        Ok(vec![
            MemoryEntry { content: "gosto de café".to_string() }
        ])
    }
}
