use cathedral_wormgraph::{WormGraphBackend, LedgerEntry, ImprovementProposal, ProposalFilter, Result, WormGraphError, MemoryFilter};
use dashmap::DashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::collections::HashMap;

pub struct TestWormGraph {
    entries: DashMap<String, LedgerEntry>,
    proposals: DashMap<String, ImprovementProposal>,
    next_id: AtomicU64,
}

impl TestWormGraph {
    pub fn new() -> Self {
        Self {
            entries: DashMap::new(),
            proposals: DashMap::new(),
            next_id: AtomicU64::new(1),
        }
    }

    pub fn insert_proposal_sync(&self, mut proposal: ImprovementProposal) -> Result<()> {
        if proposal.id.is_empty() {
            proposal.id = format!("prop_{}", self.next_id.fetch_add(1, Ordering::SeqCst));
        }
        self.proposals.insert(proposal.id.clone(), proposal);
        Ok(())
    }

    pub fn insert_entries_sync(&self, entries: Vec<LedgerEntry>) -> Result<()> {
        for entry in entries {
            let id = entry.id.clone();
            self.entries.insert(id, entry);
        }
        Ok(())
    }

    pub fn populate_with_proposals(&self, count: usize, author_did: &str) -> Result<()> {
        for i in 0..count {
            let proposal = ImprovementProposal {
                id: format!("prop_{}", i),
                title: format!("Proposta {}", i),
                description: format!("Descrição da proposta {}", i),
                code_diff: None,
                config_change: None,
                expected_impact: format!("Impacto {}", i % 3),
                risk_level: match i % 4 {
                    0 => cathedral_wormgraph::RiskLevel::Low,
                    1 => cathedral_wormgraph::RiskLevel::Medium,
                    2 => cathedral_wormgraph::RiskLevel::High,
                    _ => cathedral_wormgraph::RiskLevel::Critical,
                },
                thinking_trace: None,
                validation_status: cathedral_wormgraph::ValidationStatus::Pending,
                author_did: author_did.to_string(),
                signature: vec![],
                created_at: chrono::Utc::now(),
                validated_at: None,
                implemented_at: None,
                metrics_before: None,
                metrics_after: None,
            };
            self.insert_proposal_sync(proposal)?;
        }
        Ok(())
    }
}

#[async_trait::async_trait]
impl WormGraphBackend for TestWormGraph {
    async fn append_entry(&self, entry: LedgerEntry) -> Result<()> {
        self.entries.insert(entry.id.clone(), entry);
        Ok(())
    }

    async fn get_entries(&self, limit: Option<usize>) -> Result<Vec<LedgerEntry>> {
        let mut vec: Vec<_> = self.entries.iter().map(|kv| kv.value().clone()).collect();
        vec.sort_by_key(|e| -e.timestamp);
        let limit = limit.unwrap_or(100);
        Ok(vec.into_iter().take(limit).collect())
    }

    async fn save_proposal(&self, proposal: &ImprovementProposal) -> Result<()> {
        self.proposals.insert(proposal.id.clone(), proposal.clone());
        Ok(())
    }

    async fn list_proposals(&self, filter: ProposalFilter) -> Result<Vec<ImprovementProposal>> {
        let mut vec: Vec<ImprovementProposal> = self.proposals.iter()
            .map(|kv| kv.value().clone())
            .collect();

        // Filtros
        if let Some(risk) = filter.risk_level {
            vec.retain(|p| p.risk_level == risk);
        }
        if let Some(status) = filter.status {
            vec.retain(|p| p.validation_status == status);
        }
        if let Some(author) = filter.author_did {
            vec.retain(|p| p.author_did == author);
        }

        // Ordenação
        vec.sort_by_key(|p| -p.created_at.timestamp());

        // Paginação
        let offset = filter.offset.unwrap_or(0);
        let limit = filter.limit.unwrap_or(100);
        Ok(vec.into_iter().skip(offset).take(limit).collect())
    }

    async fn delete_proposal(&self, id: &str, author_did: &str, signature: &[u8]) -> Result<()> {
        // Verifica autor
        if let Some(proposal) = self.proposals.get(id) {
            if proposal.author_did != author_did {
                return Err(WormGraphError::Forbidden);
            }
        }
        self.proposals.remove(id);
        Ok(())
    }

    async fn list_memories(&self, filter: MemoryFilter) -> Result<Vec<LedgerEntry>> {
        let mut vec: Vec<_> = self.entries.iter().map(|kv| kv.value().clone()).collect();
        // Aplica filtros e paginação
        if let Some(agent) = filter.agent_id {
            vec.retain(|e| e.agent_id == agent);
        }
        vec.sort_by_key(|e| -e.timestamp);
        let offset = filter.offset.unwrap_or(0);
        let limit = filter.limit.unwrap_or(100);
        Ok(vec.into_iter().skip(offset).take(limit).collect())
    }
}
