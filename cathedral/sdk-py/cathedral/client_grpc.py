import asyncio
import json
import uuid
import grpc
from typing import Any, Dict, List, Optional
import time
from dataclasses import dataclass, asdict
from enum import Enum
import logging

from cathedral.cathedral.v1 import bridge_pb2, bridge_pb2_grpc
from google.protobuf.timestamp_pb2 import Timestamp

logger = logging.getLogger("cathedral-sdk-grpc")

class EventType(str, Enum):
    DESIGN_PROPOSED = "design_proposed"
    SIMULATION_COMPLETED = "simulation_completed"
    AGENT_MUTATION = "agent_mutation"

class GovernanceMode(str, Enum):
    HUMAN_IN_THE_LOOP = "human_in_the_loop"
    AUTONOMOUS_WITH_CIRCUIT_BREAKER = "autonomous_with_circuit_breaker"
    AUTONOMOUS_FULL = "autonomous_full"

@dataclass
class GovernanceResponse:
    verdict: str
    rationale: str
    conditions: Optional[List[str]] = None

class CathedralGrpcClient:
    def __init__(
        self,
        bridge_endpoint: str = "localhost:50051",
        project_id: str = "default",
        agent_id: str = "default-agent",
        batch_size: int = 50,
        flush_interval_ms: int = 5000,
        governance_mode: GovernanceMode = GovernanceMode.AUTONOMOUS_WITH_CIRCUIT_BREAKER,
    ):
        self.bridge_endpoint = bridge_endpoint
        self.project_id = project_id
        self.agent_id = agent_id
        self.batch_size = batch_size
        self.flush_interval_ms = flush_interval_ms
        self.governance_mode = governance_mode

        self._event_queue: List[bridge_pb2.Event] = []
        self._flush_task: Optional[asyncio.Task] = None
        self._channel = None
        self._stub = None
        self._running = False

    async def __aenter__(self):
        self._channel = grpc.aio.insecure_channel(self.bridge_endpoint)
        self._stub = bridge_pb2_grpc.CathedralBridgeStub(self._channel)
        self._running = True
        self._flush_task = asyncio.create_task(self._background_flusher())
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self._running = False
        if self._flush_task:
            await self._flush_task
        if self._channel:
            await self._channel.close()

    async def emit_design_proposed(
        self,
        design_hash: str,
        parent_hashes: List[str],
        parameters: Dict[str, float],
        rationale: str,
    ) -> None:
        payload = {"parameters": parameters, "rationale": rationale, "agent_id": self.agent_id}
        await self._emit_event(
            bridge_pb2.EventType.DESIGN_PROPOSED,
            design_hash,
            parent_hashes,
            payload,
            "design",
            0.5,
            0.0,
            ["design"]
        )

    async def emit_simulation_completed(
        self,
        design_hash: str,
        simulator: str,
        metrics: Dict[str, float],
        convergence: bool,
        compute_cost_usd: float,
    ) -> None:
        payload = {"simulator": simulator, "metrics": metrics, "convergence": convergence}
        await self._emit_event(
            bridge_pb2.EventType.SIMULATION_COMPLETED,
            design_hash,
            [],
            payload,
            "simulation",
            metrics.get("confidence", 0.5),
            compute_cost_usd,
            ["simulation", simulator]
        )

    async def emit_agent_mutation(
        self,
        mutation_description: str,
        previous_agent_hash: str,
    ) -> None:
        import hashlib
        payload = {"mutation": mutation_description, "substrate_version": "5003.8"}
        design_hash = hashlib.blake2b(mutation_description.encode()).hexdigest()

        response = await self.request_governance(bridge_pb2.EventType.AGENT_MUTATION, payload)
        if response.verdict == "rejected":
            raise RuntimeError(f"Agent mutation rejected: {response.rationale}")

        await self._emit_event(
            bridge_pb2.EventType.AGENT_MUTATION,
            design_hash,
            [previous_agent_hash],
            payload,
            "meta",
            0.7,
            0.0,
            ["recursive_engineering"]
        )

    async def request_governance(self, event_type: bridge_pb2.EventType, payload: Dict[str, Any]) -> GovernanceResponse:
        if self.governance_mode == GovernanceMode.AUTONOMOUS_FULL:
            return GovernanceResponse(verdict="approved", rationale="Autonomous full mode")

        if self.governance_mode == GovernanceMode.AUTONOMOUS_WITH_CIRCUIT_BREAKER:
            risk = 0.5 # Simplified risk evaluation
            if risk < 0.5:
                return GovernanceResponse(verdict="approved", rationale="Low risk decision")

        req = bridge_pb2.GovernanceRequest(
            request_id=str(uuid.uuid4()),
            project_id=self.project_id,
            agent_id=self.agent_id,
            event_type=event_type,
            proposed_state_json=json.dumps(payload),
            current_state_json="{}",
            agent_risk_score=0.5,
            domain="unknown",
            metadata={}
        )

        try:
            resp = await self._stub.RequestGovernance(req)
            verdict_map = {
                bridge_pb2.GovernanceVerdict.GOVERNANCE_VERDICT_UNSPECIFIED: "rejected",
                bridge_pb2.GovernanceVerdict.APPROVED: "approved",
                bridge_pb2.GovernanceVerdict.REJECTED: "rejected",
                bridge_pb2.GovernanceVerdict.REQUIRES_HUMAN: "requires_human",
                bridge_pb2.GovernanceVerdict.CONDITIONAL: "conditional",
                bridge_pb2.GovernanceVerdict.TIMEOUT: "timeout",
            }
            return GovernanceResponse(
                verdict=verdict_map.get(resp.verdict, "rejected"),
                rationale=resp.rationale,
                conditions=list(resp.conditions) if resp.conditions else None
            )
        except grpc.RpcError as e:
            logger.exception("Governance request failed")
            return GovernanceResponse(verdict="rejected", rationale=f"Governance request failed: {e}")

    async def _emit_event(
        self,
        event_type: bridge_pb2.EventType,
        design_hash: str,
        parent_hashes: List[str],
        payload: Dict[str, Any],
        domain: str,
        confidence: float,
        compute_cost_usd: float,
        tags: List[str]
    ) -> None:
        metadata = bridge_pb2.EventMetadata(
            domain=domain,
            confidence=confidence,
            compute_cost_usd=compute_cost_usd,
            tags=tags
        )

        timestamp = Timestamp()
        timestamp.GetCurrentTime()

        event = bridge_pb2.Event(
            event_id=str(uuid.uuid4()),
            timestamp=timestamp,
            event_type=event_type,
            design_hash=design_hash,
            parent_hashes=parent_hashes,
            payload_json=json.dumps(payload),
            metadata=metadata
        )
        self._event_queue.append(event)
        if len(self._event_queue) >= self.batch_size:
            await self._flush()

    async def _flush(self) -> None:
        if not self._event_queue or not self._stub:
            return

        batch = self._event_queue[:]
        self._event_queue.clear()

        req = bridge_pb2.IngestRequest(
            project_id=self.project_id,
            agent_id=self.agent_id,
            events=batch,
            batch_id=str(uuid.uuid4())
        )

        try:
            resp = await self._stub.Ingest(req)
            if resp.success:
                logger.debug(f"Batch of {len(batch)} events sent successfully")
            else:
                logger.error(f"Failed to send batch: {resp.message}")
        except grpc.RpcError as e:
            logger.exception("Failed to send batch")

    async def _background_flusher(self) -> None:
        while self._running:
            await asyncio.sleep(self.flush_interval_ms / 1000.0)
            if self._event_queue:
                await self._flush()
