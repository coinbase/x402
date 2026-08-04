-- ============================================================
-- SuccessRecorder SQLite Schema
-- Cathedral ARKHE – Persistent round metrics, hub performance,
-- and recommendation outcomes.
-- ============================================================

-- Core round metrics recorded on every cognitive tick
CREATE TABLE IF NOT EXISTS rounds (
    round         INTEGER PRIMARY KEY,
    acceptance    REAL NOT NULL,
    interference  REAL NOT NULL DEFAULT 0.0,
    latency_ms    REAL NOT NULL DEFAULT 0.0,
    proof_used    INTEGER NOT NULL DEFAULT 0,   -- 0/1 boolean
    timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_rounds_timestamp ON rounds(timestamp);

-- Hub performance aggregated per round
CREATE TABLE IF NOT EXISTS hub_performance (
    hub              TEXT NOT NULL,
    round            INTEGER NOT NULL,
    acceptance_rate  REAL NOT NULL,
    volume           INTEGER NOT NULL DEFAULT 0,
    roas             REAL NOT NULL DEFAULT 0.0,
    PRIMARY KEY (hub, round),
    FOREIGN KEY (round) REFERENCES rounds(round) ON DELETE CASCADE
);

-- Index for quick per‑hub lookups
CREATE INDEX IF NOT EXISTS idx_hub_perf_hub_round ON hub_performance(hub, round DESC);

-- Individual recommendation outcomes (allows fine‑grained analysis)
CREATE TABLE IF NOT EXISTS recommendations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    round           INTEGER NOT NULL,
    hub             TEXT NOT NULL,
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    accepted        INTEGER NOT NULL DEFAULT 0,  -- 0/1 boolean
    timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (round) REFERENCES rounds(round) ON DELETE CASCADE
);

-- Index for recent recommendations lookups
CREATE INDEX IF NOT EXISTS idx_recs_round_hub ON recommendations(round DESC, hub);

-- View: latest hub performance snapshot (useful for dashboards)
CREATE VIEW IF NOT EXISTS current_hub_performance AS
SELECT
    hub,
    acceptance_rate,
    volume,
    roas,
    round
FROM hub_performance
WHERE round = (SELECT MAX(round) FROM rounds);

-- View: overall agent health summary
CREATE VIEW IF NOT EXISTS agent_summary AS
SELECT
    COUNT(*) AS total_rounds,
    AVG(acceptance) AS avg_acceptance,
    AVG(interference) AS avg_interference,
    AVG(latency_ms) AS avg_latency_ms,
    AVG(proof_used) AS memory_proof_usage_rate
FROM rounds;
