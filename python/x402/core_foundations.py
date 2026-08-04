#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SUBSTRATO 873 — CORE-FOUNDATIONS                         ║
║              Pilares Fundamentais de Arquitetura de Sistemas                 ║
║  Serverless | Edge Computing | AI-Native | Self-Healing | CAP Theorem        ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import random
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class ScalingMode(Enum):
    HORIZONTAL = "horizontal"
    VERTICAL = "vertical"


class ArchitecturePattern(Enum):
    MONOLITH = "monolith"
    MICROSERVICES = "microservices"
    SERVERLESS = "serverless"
    EDGE = "edge"


@dataclass
class SystemNode:
    id: str
    capacity: float
    load: float = 0.0
    healthy: bool = True

    @property
    def utilization(self) -> float:
        return self.load / self.capacity if self.capacity > 0 else 1.0


class CAPTheorem:
    """Simulação do Teorema CAP: Consistency, Availability, Partition Tolerance."""

    def __init__(self, preference: str = "CP"):
        self.preference = preference  # CP, AP, or CA (impossible in distributed)
        self.partitions: list[list[SystemNode]] = []

    def simulate_partition(self, nodes: list[SystemNode], partition_indices: list[int]):
        """Simula uma partição de rede e aplica a preferência CAP."""
        partition_a = [n for i, n in enumerate(nodes) if i in partition_indices]
        [n for i, n in enumerate(nodes) if i not in partition_indices]

        if self.preference == "CP":
            # Sacrifica disponibilidade para manter consistência
            for node in partition_a:
                node.healthy = False
            return {"consistency": True, "availability": False, "partition_tolerance": True}
        elif self.preference == "AP":
            # Sacrifica consistência para manter disponibilidade
            return {"consistency": False, "availability": True, "partition_tolerance": True}
        else:
            return {"error": "CA impossible in distributed systems"}


class SelfHealingSystem:
    """Sistema auto-curativo com detecção de falhas e recuperação."""

    def __init__(self, nodes: list[SystemNode]):
        self.nodes = nodes
        self.failure_history: list[dict] = []

    def detect_failures(self) -> list[SystemNode]:
        """Detecta nós com utilização > 90% ou marcados como unhealthy."""
        failed = [n for n in self.nodes if n.utilization > 0.9 or not n.healthy]
        return failed

    def heal(self, strategy: str = "restart") -> dict:
        """Aplica estratégia de cura aos nós falhos."""
        failed = self.detect_failures()
        healed_count = 0

        for node in failed:
            if strategy == "restart":
                node.load = 0.0
                node.healthy = True
                healed_count += 1
            elif strategy == "scale":
                node.capacity *= 1.5
                healed_count += 1
            elif strategy == "isolate":
                self.nodes.remove(node)
                healed_count += 1

        self.failure_history.append(
            {
                "timestamp": str(datetime.now()),
                "failed": len(failed),
                "healed": healed_count,
                "strategy": strategy,
            }
        )

        return {"healed": healed_count, "total_nodes": len(self.nodes), "strategy": strategy}


class AINativeScheduler:
    """Scheduler AI-native para alocação de recursos."""

    def __init__(self, nodes: list[SystemNode]):
        self.nodes = nodes
        self.predictive_model = {}  # Simplified: load prediction

    def predict_load(self, node_id: str, horizon_minutes: int = 5) -> float:
        """Prediz carga futura (simplificado: random walk)."""
        node = next(n for n in self.nodes if n.id == node_id)
        trend = random.uniform(-0.1, 0.2)
        predicted = node.utilization + trend * horizon_minutes
        return max(0.0, min(1.0, predicted))

    def schedule(self, task_load: float) -> SystemNode | None:
        """Aloca tarefa ao nó com menor utilização prevista."""
        predictions = [(n, self.predict_load(n.id)) for n in self.nodes if n.healthy]
        if not predictions:
            return None
        best_node = min(predictions, key=lambda x: x[1])[0]
        best_node.load += task_load
        return best_node


if __name__ == "__main__":
    nodes = [SystemNode(f"node-{i}", capacity=100.0) for i in range(5)]

    # Test CAP Theorem
    cap = CAPTheorem(preference="CP")
    result = cap.simulate_partition(nodes, [0, 1])
    print(f"[CAP] CP partition result: {result}")

    # Test Self-Healing
    nodes[0].load = 95.0  # Overloaded
    nodes[2].healthy = False  # Failed
    healer = SelfHealingSystem(nodes)
    result = healer.heal(strategy="restart")
    print(f"[Self-Healing] {result}")

    # Test AI-Native Scheduler
    scheduler = AINativeScheduler(nodes)
    for i in range(10):
        node = scheduler.schedule(task_load=random.uniform(5, 20))
        print(f"[Scheduler] Task {i + 1} -> {node.id} (util: {node.utilization:.2%})")
