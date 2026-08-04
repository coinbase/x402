use serde::{Serialize, Deserialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub id: String,
    pub version: i32,
    pub decision_type: String,
    pub before_state: Option<String>,
    pub after_state: Option<String>,
    pub rationale: Option<String>,
    pub timestamp: i64,
    pub agent_id: String,
    pub entry_hash: Vec<u8>,
    pub parent_hash: Option<Vec<u8>>,
    pub signature: Option<Vec<u8>>,
    pub public_key: Option<Vec<u8>>,
    pub nostr_event_id: Option<String>,
    pub tree_id: Option<String>,
    pub parent_event_id: Option<String>,
    pub zk_proof_hash: Option<Vec<u8>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct ImprovementProposal {
    pub id: String,
    pub title: String,
    pub description: String,
    pub code_diff: Option<String>,
    pub config_change: Option<String>,
    pub expected_impact: String,
    pub risk_level: RiskLevel,
    pub thinking_trace: Option<String>,
    pub validation_status: ValidationStatus,
    pub author_did: String,
    pub signature: Vec<u8>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub validated_at: Option<chrono::DateTime<chrono::Utc>>,
    pub implemented_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metrics_before: Option<String>,
    pub metrics_after: Option<String>,
}

impl ImprovementProposal {
    pub fn new(title: String, description: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            description,
            code_diff: None,
            config_change: None,
            expected_impact: String::new(),
            risk_level: RiskLevel::Low,
            thinking_trace: None,
            validation_status: ValidationStatus::Pending,
            author_did: String::new(),
            signature: vec![],
            created_at: chrono::Utc::now(),
            validated_at: None,
            implemented_at: None,
            metrics_before: None,
            metrics_after: None,
        }
    }
    pub fn with_risk(mut self, risk: RiskLevel) -> Self { self.risk_level = risk; self }
    pub fn with_code_diff(mut self, diff: String) -> Self { self.code_diff = Some(diff); self }
    pub fn with_impact(mut self, impact: String) -> Self { self.expected_impact = impact; self }
}

#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub enum RiskLevel {
    Low, Medium, High, Critical
}

impl RiskLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "Low",
            Self::Medium => "Medium",
            Self::High => "High",
            Self::Critical => "Critical",
        }
    }
}

#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub enum ValidationStatus {
    Pending, Validating, Approved, Rejected, Implemented, Reverted
}

impl ValidationStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "Pending",
            Self::Validating => "Validating",
            Self::Approved => "Approved",
            Self::Rejected => "Rejected",
            Self::Implemented => "Implemented",
            Self::Reverted => "Reverted",
        }
    }
}

#[derive(Clone)]
pub struct ProposalFilter {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub risk_level: Option<RiskLevel>,
    pub status: Option<ValidationStatus>,
    pub author_did: Option<String>,
}

#[derive(Clone)]
pub struct MemoryFilter {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub agent_id: Option<String>,
    pub decision_type: Option<String>,
    pub since_timestamp: Option<i64>,
}

pub type Result<T> = std::result::Result<T, WormGraphError>;

#[derive(Debug)]
pub enum WormGraphError {
    Forbidden,
    Other,
}

#[async_trait::async_trait]
pub trait WormGraphBackend: Send + Sync {
    async fn append_entry(&self, entry: LedgerEntry) -> Result<()>;
    async fn get_entries(&self, limit: Option<usize>) -> Result<Vec<LedgerEntry>>;
    async fn save_proposal(&self, proposal: &ImprovementProposal) -> Result<()>;
    async fn list_proposals(&self, filter: ProposalFilter) -> Result<Vec<ImprovementProposal>>;
    async fn delete_proposal(&self, id: &str, author_did: &str, signature: &[u8]) -> Result<()>;
    async fn list_memories(&self, filter: MemoryFilter) -> Result<Vec<LedgerEntry>>;
}

pub enum WormGraphBackendType {
    // Json(JsonWormGraph),
    // Sqlite(SqliteWormGraph),
    // Postgres(PostgresWormGraph),
}

pub struct WormGraphClient {
    backend: Box<dyn WormGraphBackend>,
}
impl WormGraphClient {
    pub fn new(backend: impl WormGraphBackend + 'static) -> Self {
        Self { backend: Box::new(backend) }
    }
    pub async fn get_proposal(&self, id: &str) -> Result<Option<ImprovementProposal>> {
        let filter = ProposalFilter { limit: None, offset: None, risk_level: None, status: None, author_did: None };
        Ok(self.backend.list_proposals(filter).await?.into_iter().find(|p| p.id == id))
    }
    pub async fn save_proposal(&self, proposal: &ImprovementProposal) -> Result<()> {
        self.backend.save_proposal(proposal).await
    }
    pub async fn list_proposals(&self, filter: ProposalFilter) -> Result<Vec<ImprovementProposal>> {
        self.backend.list_proposals(filter).await
    }
    pub async fn delete_proposal(&self, id: &str, author_did: &str, signature: &[u8]) -> Result<()> {
        self.backend.delete_proposal(id, author_did, signature).await
    }
    pub async fn ping(&self) -> Result<()> {
        Ok(())
    }
}
pub mod backends {
    pub mod sqlite;
}
