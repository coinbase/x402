#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SUBSTRATO 879 — RELIABILITY-LAYER                        ║
║  High Availability | Fault Tolerance | Circuit Breakers | Retries | DR        ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from typing import Any


class CircuitState(Enum):
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class CircuitBreaker:
    """Circuit Breaker pattern."""

    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    half_open_max_calls: int = 3

    def __post_init__(self):
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = 0.0

    def call(self, func: Callable, *args, **kwargs) -> Any:
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self.success_count = 0
            else:
                raise Exception("Circuit breaker OPEN")

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise e

    def _on_success(self):
        self.failure_count = 0
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.half_open_max_calls:
                self.state = CircuitState.CLOSED

    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN


class RetryPolicy:
    """Política de retry com backoff exponencial."""

    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base

    def execute(self, func: Callable, *args, **kwargs) -> Any:
        last_exception = None

        for attempt in range(self.max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < self.max_retries:
                    delay = min(self.base_delay * (self.exponential_base**attempt), self.max_delay)
                    # Add jitter
                    delay *= random.uniform(0.5, 1.5)
                    print(f"[Retry] Attempt {attempt + 1} failed, retrying in {delay:.2f}s")
                    time.sleep(delay)

        raise last_exception


class BackpressureController:
    """Controlador de backpressure."""

    def __init__(self, max_queue_size: int = 1000, target_latency: float = 0.1):
        self.max_queue_size = max_queue_size
        self.target_latency = target_latency
        self.current_queue_size = 0
        self.rejection_rate = 0.0

    def admit(self, request_size: int = 1) -> bool:
        if self.current_queue_size + request_size > self.max_queue_size:
            self.rejection_rate = min(1.0, self.rejection_rate + 0.1)
            return False

        self.current_queue_size += request_size
        self.rejection_rate = max(0.0, self.rejection_rate - 0.05)
        return True

    def complete(self, request_size: int = 1):
        self.current_queue_size = max(0, self.current_queue_size - request_size)

    @property
    def load_factor(self) -> float:
        return self.current_queue_size / self.max_queue_size


class DisasterRecovery:
    """Sistema de Disaster Recovery com RPO/RTO."""

    def __init__(self, rpo_seconds: float = 300, rto_seconds: float = 600):
        self.rpo = rpo_seconds  # Recovery Point Objective
        self.rto = rto_seconds  # Recovery Time Objective
        self.snapshots: list[dict] = []
        self.last_snapshot_time = 0.0

    def snapshot(self, data: dict):
        self.snapshots.append({"timestamp": time.time(), "data": data.copy()})
        self.last_snapshot_time = time.time()

    def recover(self, target_time: float = None) -> dict | None:
        if not self.snapshots:
            return None

        # Find nearest snapshot before target_time
        if target_time is None:
            target_time = time.time()

        valid_snapshots = [s for s in self.snapshots if s["timestamp"] <= target_time]
        if not valid_snapshots:
            return None

        return max(valid_snapshots, key=lambda s: s["timestamp"])

    @property
    def meets_rpo(self) -> bool:
        return time.time() - self.last_snapshot_time <= self.rpo


class HighAvailabilityCluster:
    """Cluster de alta disponibilidade."""

    def __init__(self, nodes: list[str]):
        self.nodes = nodes
        self.active_nodes = set(nodes)
        self.failover_history: list[dict] = []

    def health_check(self):
        """Simula health checks e remove nós falhos."""
        for node in list(self.active_nodes):
            if random.random() < 0.05:  # 5% failure rate
                self.active_nodes.remove(node)
                self.failover_history.append(
                    {"node": node, "action": "removed", "timestamp": time.time()}
                )

    def get_active_node(self) -> str | None:
        if not self.active_nodes:
            return None
        return random.choice(list(self.active_nodes))

    @property
    def availability(self) -> float:
        return len(self.active_nodes) / len(self.nodes)


if __name__ == "__main__":
    # Test Circuit Breaker
    cb = CircuitBreaker(failure_threshold=3)

    def flaky_service():
        if random.random() < 0.7:
            raise Exception("Service failure")
        return "success"

    for i in range(10):
        try:
            result = cb.call(flaky_service)
            print(f"[CB] Call {i + 1}: {result} (state: {cb.state.value})")
        except Exception as e:
            print(f"[CB] Call {i + 1}: {e} (state: {cb.state.value})")

    # Test Retry
    retry = RetryPolicy(max_retries=3)
    try:
        result = retry.execute(flaky_service)
        print(f"[Retry] Success: {result}")
    except Exception:
        print("[Retry] All retries exhausted")

    # Test Backpressure
    bp = BackpressureController(max_queue_size=10)
    for i in range(15):
        admitted = bp.admit()
        print(
            f"[Backpressure] Request {i + 1}: {'admitted' if admitted else 'rejected'} (load: {bp.load_factor:.1%})"
        )

    # Test HA Cluster
    ha = HighAvailabilityCluster(["node-1", "node-2", "node-3"])
    for _ in range(5):
        ha.health_check()
        print(
            f"[HA] Active: {len(ha.active_nodes)}/{len(ha.nodes)} | Availability: {ha.availability:.1%}"
        )
