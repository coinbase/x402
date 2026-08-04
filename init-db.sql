-- init-db.sql
-- Script de inicialização do banco de dados PostgreSQL para Cathedral ARKHE
-- Cria tabelas para WormGraph, Capability Tokens, DLQ (backup), Circuit Breaker e Last-Effort
--
-- Selo: CATHEDRAL-ARKHE-8000-INIT-DB-v2.1.0-2026-06-19

-- Extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. WORMGRAPH — Eventos imutáveis de auditoria
-- ============================================================
CREATE TABLE IF NOT EXISTS wormgraph_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type      VARCHAR(64) NOT NULL,
    component       VARCHAR(64) NOT NULL,
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata        JSONB
);

CREATE INDEX IF NOT EXISTS idx_wormgraph_events_type ON wormgraph_events(event_type);
CREATE INDEX IF NOT EXISTS idx_wormgraph_events_component ON wormgraph_events(component);
CREATE INDEX IF NOT EXISTS idx_wormgraph_events_created_at ON wormgraph_events(created_at DESC);

-- ============================================================
-- 2. CAPABILITY TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS capability_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_type      SMALLINT NOT NULL,           -- 0=Expert, 1=Operator, 2=Auditor, 3=Researcher, 4=Guest
    holder          VARCHAR(128) NOT NULL,
    expiry          TIMESTAMPTZ NOT NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_capability_tokens_holder ON capability_tokens(holder);
CREATE INDEX IF NOT EXISTS idx_capability_tokens_expiry ON capability_tokens(expiry);

-- ============================================================
-- 3. ACCESS POLICIES (Seal)
-- ============================================================
CREATE TABLE IF NOT EXISTS access_policies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    encrypted_id    BYTEA NOT NULL UNIQUE,
    policy_type     SMALLINT NOT NULL,           -- 0=token_gated, 1=time_locked, 2=allowlist, 3=subscription
    params          BYTEA,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_policies_encrypted_id ON access_policies(encrypted_id);

-- ============================================================
-- 4. DLQ MESSAGES (backup / auditoria)
-- ============================================================
CREATE TABLE IF NOT EXISTS dlq_messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_id         VARCHAR(128),
    component           VARCHAR(64) NOT NULL,
    error_type          VARCHAR(64),
    error_message       TEXT,
    payload             BYTEA,
    enqueued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retry_count         INTEGER NOT NULL DEFAULT 0,
    max_retries         INTEGER NOT NULL DEFAULT 5,
    poison_pill         BOOLEAN NOT NULL DEFAULT false,
    last_effort_attempted BOOLEAN NOT NULL DEFAULT false,
    replayed_at         TIMESTAMPTZ,
    acknowledged_at     TIMESTAMPTZ,
    acknowledged_by     VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_dlq_messages_component ON dlq_messages(component);
CREATE INDEX IF NOT EXISTS idx_dlq_messages_enqueued_at ON dlq_messages(enqueued_at DESC);

-- ============================================================
-- 5. CIRCUIT BREAKER HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS circuit_breaker_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    component       VARCHAR(64) NOT NULL,
    state           VARCHAR(16) NOT NULL,        -- closed, open, half_open
    failure_count   INTEGER,
    triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata        JSONB
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_component ON circuit_breaker_events(component);

-- ============================================================
-- 6. LAST-EFFORT ATTEMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS last_effort_attempts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dlq_message_id  UUID REFERENCES dlq_messages(id),
    strategy        VARCHAR(64) NOT NULL,
    attempt_number  INTEGER NOT NULL,
    success         BOOLEAN NOT NULL,
    error           TEXT,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_last_effort_dlq_message_id ON last_effort_attempts(dlq_message_id);

-- ============================================================
-- 7. GRANTS
-- ============================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cathedral;