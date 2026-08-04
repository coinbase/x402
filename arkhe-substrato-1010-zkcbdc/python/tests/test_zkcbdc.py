#!/usr/bin/env python3
"""Canonical tests — Substrate 1010 zkCBDC"""

import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from zkcbdc_engine import ZKCBCC, ConfidentialTransaction, TransactionStatus, AccountState

@pytest.fixture
def engine():
    return ZKCBCC(total_supply=1_000_000_000)

def test_create_account(engine):
    acc = engine.create_account("alice", 50000)
    assert acc.account_id == "alice"
    assert acc.commitment_balance is not None

def test_create_transaction(engine):
    engine.create_account("alice", 50000)
    engine.create_account("bob", 30000)
    tx = engine.create_transaction("alice", "bob", 1000)
    assert tx.status == TransactionStatus.ANCHORED
    assert tx.seal.startswith("ZKCBDC-")
    assert tx.temporal_anchor is not None

def test_double_spend_detection(engine):
    engine.create_account("alice", 50000)
    engine.create_account("bob", 30000)
    tx1 = engine.create_transaction("alice", "bob", 1000)
    with pytest.raises(ValueError, match="DOUBLE SPEND"):
        engine.create_transaction("alice", "bob", 1000)

def test_sanctions_rejection(engine):
    engine.create_account("eve", 50000)
    engine.create_account("bob", 30000)
    engine.add_to_sanctions_list("eve")
    tx = engine.create_transaction("eve", "bob", 500)
    assert tx.status == TransactionStatus.REJECTED

def test_frozen_account(engine):
    engine.create_account("alice", 50000)
    engine.create_account("bob", 30000)
    engine.freeze_account("alice")
    tx = engine.create_transaction("alice", "bob", 500)
    assert tx.status == TransactionStatus.REJECTED

def test_verify_proof(engine):
    engine.create_account("alice", 50000)
    engine.create_account("bob", 30000)
    tx = engine.create_transaction("alice", "bob", 1000)
    assert engine.verify_proof(tx) is True

def test_audit_supply(engine):
    engine.create_account("alice", 50000)
    engine.create_account("bob", 30000)
    engine.create_transaction("alice", "bob", 1000)
    audit = engine.audit_supply()
    assert audit["total_supply"] == 1_000_000_000
    assert audit["total_transactions"] == 1
    assert audit["supply_invariant"] == "PRESERVED"

def test_report(engine):
    report = engine.generate_report()
    assert "ZKCBDC-1010-2026-05-31" in report
    assert "Hestia" in report
    assert "Hermes" in report
    assert "Themis" in report

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
