-- Tabela de propostas de melhoria
CREATE TABLE IF NOT EXISTS improvement_proposals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    code_diff TEXT,
    config_change TEXT,
    expected_impact TEXT,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('Low','Medium','High','Critical')),
    thinking_trace TEXT,
    validation_status TEXT NOT NULL DEFAULT 'Pending' CHECK (validation_status IN ('Pending','Validating','Approved','Rejected','Implemented','Reverted')),
    author_did TEXT NOT NULL,
    signature BLOB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    validated_at TIMESTAMP,
    implemented_at TIMESTAMP,
    metrics_before TEXT,
    metrics_after TEXT
);

-- Tabela de memórias (WormGraph)
CREATE TABLE IF NOT EXISTS wormgraph_entries (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL DEFAULT 1,
    decision_type TEXT NOT NULL,
    before_state TEXT,
    after_state TEXT,
    rationale TEXT,
    timestamp INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    entry_hash BLOB NOT NULL,
    parent_hash BLOB,
    signature BLOB,
    public_key BLOB,
    nostr_event_id TEXT,
    tree_id TEXT,
    parent_event_id TEXT,
    zk_proof_hash BLOB
);

-- Índices
CREATE INDEX idx_proposals_risk ON improvement_proposals(risk_level);
CREATE INDEX idx_proposals_status ON improvement_proposals(validation_status);
CREATE INDEX idx_proposals_author ON improvement_proposals(author_did);
CREATE INDEX idx_proposals_created ON improvement_proposals(created_at DESC);
CREATE INDEX idx_wormgraph_agent ON wormgraph_entries(agent_id);
CREATE INDEX idx_wormgraph_timestamp ON wormgraph_entries(timestamp DESC);