use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use crate::{WormGraphBackend, LedgerEntry, ImprovementProposal, ProposalFilter, Result, WormGraphError, MemoryFilter};
use uuid::Uuid;
use chrono::Utc;

pub struct SqliteWormGraph {
    pool: SqlitePool,
}

impl SqliteWormGraph {
    pub async fn new(database_url: &str) -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await.unwrap();
        Ok(Self { pool })
    }
}

#[async_trait::async_trait]
impl WormGraphBackend for SqliteWormGraph {
    async fn append_entry(&self, entry: LedgerEntry) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO wormgraph_entries
            (id, version, decision_type, before_state, after_state, rationale, timestamp, agent_id,
             entry_hash, parent_hash, signature, public_key, nostr_event_id, tree_id, parent_event_id, zk_proof_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            entry.id, entry.version, entry.decision_type, entry.before_state, entry.after_state,
            entry.rationale, entry.timestamp, entry.agent_id, entry.entry_hash, entry.parent_hash,
            entry.signature, entry.public_key, entry.nostr_event_id, entry.tree_id,
            entry.parent_event_id, entry.zk_proof_hash
        ).execute(&self.pool).await.unwrap();
        Ok(())
    }

    async fn get_entries(&self, limit: Option<usize>) -> Result<Vec<LedgerEntry>> {
        let limit = limit.unwrap_or(100) as i64;
        let rows = sqlx::query!(
            r#"
            SELECT id, version, decision_type, before_state, after_state, rationale, timestamp, agent_id,
                   entry_hash, parent_hash, signature, public_key, nostr_event_id, tree_id, parent_event_id, zk_proof_hash
            FROM wormgraph_entries
            ORDER BY timestamp DESC
            LIMIT ?
            "#,
            limit
        )
        .fetch_all(&self.pool)
        .await.unwrap();
        Ok(rows.into_iter().map(|row| LedgerEntry {
            id: row.id.unwrap_or_default(),
            version: row.version.unwrap_or_default() as i32,
            decision_type: row.decision_type.unwrap_or_default(),
            before_state: row.before_state,
            after_state: row.after_state,
            rationale: row.rationale,
            timestamp: row.timestamp.unwrap_or_default() as i64,
            agent_id: row.agent_id.unwrap_or_default(),
            entry_hash: row.entry_hash.unwrap_or_default(),
            parent_hash: row.parent_hash,
            signature: row.signature,
            public_key: row.public_key,
            nostr_event_id: row.nostr_event_id,
            tree_id: row.tree_id,
            parent_event_id: row.parent_event_id,
            zk_proof_hash: row.zk_proof_hash,
        }).collect())
    }

    async fn save_proposal(&self, proposal: &ImprovementProposal) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO improvement_proposals
            (id, title, description, code_diff, config_change, expected_impact,
             risk_level, thinking_trace, validation_status, author_did, signature,
             created_at, validated_at, implemented_at, metrics_before, metrics_after)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                description=excluded.description,
                code_diff=excluded.code_diff,
                config_change=excluded.config_change,
                expected_impact=excluded.expected_impact,
                risk_level=excluded.risk_level,
                thinking_trace=excluded.thinking_trace,
                validation_status=excluded.validation_status,
                author_did=excluded.author_did,
                signature=excluded.signature,
                created_at=excluded.created_at,
                validated_at=excluded.validated_at,
                implemented_at=excluded.implemented_at,
                metrics_before=excluded.metrics_before,
                metrics_after=excluded.metrics_after
            "#,
            proposal.id, proposal.title, proposal.description, proposal.code_diff,
            proposal.config_change, proposal.expected_impact, proposal.risk_level.as_str(),
            proposal.thinking_trace, proposal.validation_status.as_str(), proposal.author_did,
            proposal.signature, proposal.created_at, proposal.validated_at,
            proposal.implemented_at, proposal.metrics_before, proposal.metrics_after
        ).execute(&self.pool).await.unwrap();
        Ok(())
    }

    async fn list_proposals(&self, filter: ProposalFilter) -> Result<Vec<ImprovementProposal>> {
        let mut query = String::from(
            "SELECT id, title, description, code_diff, config_change, expected_impact, risk_level,
             thinking_trace, validation_status, author_did, signature, created_at, validated_at,
             implemented_at, metrics_before, metrics_after
             FROM improvement_proposals WHERE 1=1"
        );
        let mut params: Vec<String> = vec![];

        if let Some(risk) = filter.risk_level {
            query.push_str(" AND risk_level = ?");
            params.push(risk.as_str().to_string());
        }
        if let Some(status) = filter.status {
            query.push_str(" AND validation_status = ?");
            params.push(status.as_str().to_string());
        }
        if let Some(author) = filter.author_did {
            query.push_str(" AND author_did = ?");
            params.push(author);
        }
        query.push_str(" ORDER BY created_at DESC");
        if let Some(limit) = filter.limit {
            query.push_str(" LIMIT ?");
            params.push(limit.to_string());
        }
        if let Some(offset) = filter.offset {
            query.push_str(" OFFSET ?");
            params.push(offset.to_string());
        }

        let mut query_builder = sqlx::query(&query);
        for param in params {
            query_builder = query_builder.bind(param);
        }

        let rows = query_builder.fetch_all(&self.pool).await.unwrap();
        Ok(rows.into_iter().map(|row| ImprovementProposal {
            id: row.try_get("id").unwrap_or_default(),
            title: row.try_get("title").unwrap_or_default(),
            description: row.try_get("description").unwrap_or_default(),
            code_diff: row.try_get("code_diff").ok(),
            config_change: row.try_get("config_change").ok(),
            expected_impact: row.try_get("expected_impact").unwrap_or_default(),
            risk_level: match row.try_get::<String, _>("risk_level").unwrap_or_default().as_str() {
                "Low" => crate::RiskLevel::Low,
                "Medium" => crate::RiskLevel::Medium,
                "High" => crate::RiskLevel::High,
                "Critical" => crate::RiskLevel::Critical,
                _ => crate::RiskLevel::Low,
            },
            thinking_trace: row.try_get("thinking_trace").ok(),
            validation_status: match row.try_get::<String, _>("validation_status").unwrap_or_default().as_str() {
                "Pending" => crate::ValidationStatus::Pending,
                "Validating" => crate::ValidationStatus::Validating,
                "Approved" => crate::ValidationStatus::Approved,
                "Rejected" => crate::ValidationStatus::Rejected,
                "Implemented" => crate::ValidationStatus::Implemented,
                "Reverted" => crate::ValidationStatus::Reverted,
                _ => crate::ValidationStatus::Pending,
            },
            author_did: row.try_get("author_did").unwrap_or_default(),
            signature: row.try_get("signature").unwrap_or_default(),
            created_at: row.try_get("created_at").unwrap_or_default(),
            validated_at: row.try_get("validated_at").ok(),
            implemented_at: row.try_get("implemented_at").ok(),
            metrics_before: row.try_get("metrics_before").ok(),
            metrics_after: row.try_get("metrics_after").ok(),
        }).collect())
    }

    async fn delete_proposal(&self, id: &str, author_did: &str, signature: &[u8]) -> Result<()> {
        sqlx::query!("DELETE FROM improvement_proposals WHERE id = ? AND author_did = ?", id, author_did)
            .execute(&self.pool).await.map_err(|_| WormGraphError::Other)?;
        Ok(())
    }

    async fn list_memories(&self, filter: MemoryFilter) -> Result<Vec<LedgerEntry>> {
        let mut query = String::from(
            "SELECT id, version, decision_type, before_state, after_state, rationale, timestamp, agent_id,
             entry_hash, parent_hash, signature, public_key, nostr_event_id, tree_id, parent_event_id, zk_proof_hash
             FROM wormgraph_entries WHERE 1=1"
        );
        let mut params: Vec<String> = vec![];

        if let Some(agent) = filter.agent_id {
            query.push_str(" AND agent_id = ?");
            params.push(agent);
        }
        if let Some(decision) = filter.decision_type {
            query.push_str(" AND decision_type = ?");
            params.push(decision);
        }
        if let Some(since) = filter.since_timestamp {
            query.push_str(" AND timestamp >= ?");
            params.push(since.to_string());
        }

        query.push_str(" ORDER BY timestamp DESC");
        if let Some(limit) = filter.limit {
            query.push_str(" LIMIT ?");
            params.push(limit.to_string());
        }
        if let Some(offset) = filter.offset {
            query.push_str(" OFFSET ?");
            params.push(offset.to_string());
        }

        let mut qb = sqlx::query(&query);
        for p in params { qb = qb.bind(p); }
        let rows = qb.fetch_all(&self.pool).await.unwrap();
        use sqlx::Row;
        Ok(rows.into_iter().map(|row| LedgerEntry {
            id: row.try_get("id").unwrap_or_default(),
            version: row.try_get("version").unwrap_or_default(),
            decision_type: row.try_get("decision_type").unwrap_or_default(),
            before_state: row.try_get("before_state").ok(),
            after_state: row.try_get("after_state").ok(),
            rationale: row.try_get("rationale").ok(),
            timestamp: row.try_get("timestamp").unwrap_or_default(),
            agent_id: row.try_get("agent_id").unwrap_or_default(),
            entry_hash: row.try_get("entry_hash").unwrap_or_default(),
            parent_hash: row.try_get("parent_hash").ok(),
            signature: row.try_get("signature").ok(),
            public_key: row.try_get("public_key").ok(),
            nostr_event_id: row.try_get("nostr_event_id").ok(),
            tree_id: row.try_get("tree_id").ok(),
            parent_event_id: row.try_get("parent_event_id").ok(),
            zk_proof_hash: row.try_get("zk_proof_hash").ok(),
        }).collect())
    }
}