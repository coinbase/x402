import asyncio
import os
import sys
from collections.abc import Callable
from typing import Any

# Add orchestrator to path
sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../../989y3-full-100t-orchestrator")),
)

try:
    from full_100t_orchestrator import Full100TOrchestrator, InferencePriority
except ImportError:
    # Handle mock for testing environments where the orchestrator might not be available
    Full100TOrchestrator = None
    InferencePriority = None


class ArkheAgentFieldBridge:
    """
    Python wrapper that exposes ARKHE substrates as AgentField-compatible decorators.

    Mapping:
    - @app.reasoner -> OmniAgent (939) via this decorator.
    - app.ai -> FULL-100T-ORCHESTRATOR (989.y.3).
    - shared memory -> Bindu (952).
    - governance/DIDs -> Passport-Gateway (989.x) + Axiarchy (954).
    """

    def __init__(self, node_id: str, version: str = "1.0.0", ai_config: dict | None = None):
        self.node_id = node_id
        self.version = version
        self.ai_config = ai_config or {}
        self.orchestrator = Full100TOrchestrator() if Full100TOrchestrator else None

        # Mocks for memory and governance
        self.memory = _BinduMemoryBridge()
        self.governance = _AxiarchyGovernanceBridge()

        # Start the orchestrator in the background if running in an event loop
        # Note: In a real app, this should be awaited in an init/run method.
        self._orchestrator_started = False

    async def _ensure_orchestrator(self):
        if self.orchestrator and not self._orchestrator_started:
            await self.orchestrator.run(max_concurrent=8)
            self._orchestrator_started = True

    def reasoner(self, tags: list[str] = None):
        """
        AgentField-compatible @app.reasoner decorator.
        Maps to OmniAgent (939) conceptually.
        """

        def decorator(func: Callable):
            func._is_reasoner = True
            func._reasoner_tags = tags or []
            return func

        return decorator

    async def ai(self, system: str, user: str, schema: Any = None, **kwargs) -> Any:
        """
        AgentField-compatible app.ai method.
        Maps to FULL-100T-ORCHESTRATOR (989.y.3).
        """
        await self._ensure_orchestrator()

        if self.orchestrator:
            prompt = f"{system}\n\n{user}"
            # Extract preferred model from ai_config if provided
            model_id = self.ai_config.get("model")

            # Submit to orchestrator
            # We map 'schema' conceptually to reasoning task types or process it manually
            job = await self.orchestrator.submit_job(
                prompt=prompt,
                task_type="reasoning",
                priority=InferencePriority.HIGH,
                model_id=model_id,
            )

            # Wait for completion (poll for simplicity in this bridge)
            while job.status.value not in ["completed", "failed", "cached"]:
                await asyncio.sleep(0.1)

            return {
                "result": job.result,
                "model_id": job.model_id,
                "job_id": job.job_id,
                "seal": job.seal,
            }
        else:
            return {
                "result": "Orchestrator not available.",
                "model_id": "mock",
                "job_id": "mock-123",
                "seal": "MOCK-SEAL",
            }

    async def pause(
        self, approval_request_id: str, approval_request_url: str, expires_in_hours: int = 48
    ):
        """
        AgentField-compatible Human-in-the-Loop app.pause method.
        """
        # Conceptually handled by Axiarchy (954)
        print(f"Agent {self.node_id} pausing for approval via {approval_request_url}")
        return True

    async def call(self, agent_func: str, input: dict):
        """
        AgentField-compatible cross-agent call.
        """
        print(f"Routing call to {agent_func} with input {input}")
        return {"status": "routed"}


class _BinduMemoryBridge:
    """Mock for shared memory -> Bindu (952)"""

    def __init__(self):
        self._store = {}

    def set(self, key: str, value: Any):
        self._store[key] = value

    def get(self, key: str) -> Any:
        return self._store.get(key)

    def search(self, query: str, top_k: int = 5):
        return []


class _AxiarchyGovernanceBridge:
    """Mock for governance/DIDs -> Passport-Gateway (989.x) + Axiarchy (954)"""

    def __init__(self):
        pass

    def get_did(self) -> str:
        return "did:arkhe:axiarchy:mock-123"

    def verify_access(self, target: str) -> bool:
        return True
