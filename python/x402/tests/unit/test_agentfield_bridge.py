import pytest

from x402.agentfield_bridge import ArkheAgentFieldBridge


@pytest.fixture
def bridge():
    return ArkheAgentFieldBridge(node_id="test-agent")


@pytest.mark.asyncio
async def test_bridge_ai_method(bridge):
    """Test the app.ai method wrapping FULL-100T-ORCHESTRATOR."""
    result = await bridge.ai(system="System Prompt", user="User Input")

    assert "result" in result
    assert "model_id" in result
    assert "job_id" in result
    assert "seal" in result

    if bridge.orchestrator:
        assert result["job_id"].startswith("job-")


def test_bridge_reasoner_decorator(bridge):
    """Test the @app.reasoner decorator."""

    @bridge.reasoner(tags=["test", "unit"])
    def dummy_func():
        return "ok"

    assert hasattr(dummy_func, "_is_reasoner")
    assert dummy_func._is_reasoner is True
    assert dummy_func._reasoner_tags == ["test", "unit"]


@pytest.mark.asyncio
async def test_bridge_mocks(bridge):
    """Test memory and governance mocks."""
    bridge.memory.set("key1", "val1")
    assert bridge.memory.get("key1") == "val1"

    did = bridge.governance.get_did()
    assert did.startswith("did:arkhe:")
    assert bridge.governance.verify_access("test") is True
