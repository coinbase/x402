#!/usr/bin/env python3
"""Testes canônicos — Substrato 989.y.3 FULL-100T-ORCHESTRATOR"""

import pytest
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from full_100t_orchestrator import (
    Full100TOrchestrator, InferenceJob, InferencePriority,
    InferenceTarget, JobStatus, OrchestratorConfig, ModelMetrics,
)

@pytest.fixture
def orch():
    return Full100TOrchestrator()

@pytest.mark.asyncio
async def test_submit_job(orch):
    job = await orch.submit_job("Test prompt", "reasoning")
    assert job.model_id is not None
    assert job.priority == InferencePriority.MEDIUM
    assert job.seal.startswith("JOB-")

@pytest.mark.asyncio
async def test_submit_job_critical(orch):
    job = await orch.submit_job("Critical prompt", "reasoning",
                                priority=InferencePriority.CRITICAL)
    assert job.priority == InferencePriority.CRITICAL
    assert job.target is None  # Será definido no processamento

@pytest.mark.asyncio
async def test_select_model(orch):
    model = orch.select_model("coding")
    assert model in orch.AVAILABLE_MODELS
    model = orch.select_model("long_context")
    assert model == "llama_4_behemoth"

def test_select_target(orch):
    target = orch.select_target("deepseek_v4_pro", InferencePriority.CRITICAL)
    assert target == InferenceTarget.ARKHE_RTL

@pytest.mark.asyncio
async def test_process_jobs(orch):
    await orch.run(max_concurrent=4)
    job = await orch.submit_job("Test processing", "reasoning",
                                priority=InferencePriority.HIGH)
    await asyncio.sleep(0.5)  # Aguardar processamento
    assert job.job_id in orch.completed_jobs
    completed = orch.completed_jobs[job.job_id]
    assert completed.status == JobStatus.COMPLETED
    assert completed.result is not None
    await orch.stop()

def test_generate_report(orch):
    report = orch.generate_report()
    assert "ORCH-100T-F3A4B5C6D7E8F901" in report
    assert "Zeus" in report

if __name__ == "__main__":
    pytest.main([__file__, "-v"])