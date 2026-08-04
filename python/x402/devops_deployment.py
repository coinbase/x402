#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SUBSTRATO 881 — DEVOPS-DEPLOYMENT                        ║
║  Docker | Kubernetes | CI/CD | IaC | Blue-Green | Canary Deployments         ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import random
import time
from dataclasses import dataclass, field
from enum import Enum


class DeploymentStrategy(Enum):
    ROLLING = "rolling"
    BLUE_GREEN = "blue_green"
    CANARY = "canary"
    RECREATE = "recreate"


@dataclass
class Container:
    """Container Docker simulado."""

    image: str
    tag: str = "latest"
    env: dict[str, str] = field(default_factory=dict)
    ports: dict[int, int] = field(default_factory=dict)
    status: str = "stopped"
    health: bool = True

    def start(self):
        self.status = "running"
        print(f"[Docker] Started container: {self.image}:{self.tag}")

    def stop(self):
        self.status = "stopped"
        print(f"[Docker] Stopped container: {self.image}:{self.tag}")

    def restart(self):
        self.stop()
        time.sleep(0.1)
        self.start()


class K8sPod:
    """Pod Kubernetes simulado."""

    def __init__(self, name: str, containers: list[Container], replicas: int = 1):
        self.name = name
        self.containers = containers
        self.replicas = replicas
        self.status = "Pending"
        self.ip = None

    def deploy(self):
        self.status = "Running"
        for c in self.containers:
            c.start()
        self.ip = f"10.0.{random.randint(0, 255)}.{random.randint(0, 255)}"
        print(f"[K8s] Pod {self.name} deployed with IP {self.ip}")

    def scale(self, new_replicas: int):
        old = self.replicas
        self.replicas = new_replicas
        print(f"[K8s] Scaled {self.name}: {old} -> {new_replicas} replicas")

    def delete(self):
        self.status = "Terminating"
        for c in self.containers:
            c.stop()
        self.status = "Terminated"


class CICDPipeline:
    """Pipeline CI/CD com stages."""

    def __init__(self, name: str):
        self.name = name
        self.stages: list[dict] = []
        self.artifacts: list[str] = []
        self.status = "idle"

    def add_stage(self, name: str, steps: list[str]):
        self.stages.append({"name": name, "steps": steps, "status": "pending"})

    def run(self) -> bool:
        self.status = "running"
        print(f"[CI/CD] Pipeline {self.name} started")

        for stage in self.stages:
            stage["status"] = "running"
            print(f"[CI/CD] Stage: {stage['name']}")

            for step in stage["steps"]:
                print(f"[CI/CD]   Step: {step}")
                time.sleep(0.1)
                if random.random() < 0.05:  # 5% failure rate
                    stage["status"] = "failed"
                    self.status = "failed"
                    print(f"[CI/CD] Pipeline FAILED at stage: {stage['name']}")
                    return False

            stage["status"] = "success"

        self.status = "success"
        print(f"[CI/CD] Pipeline {self.name} completed successfully")
        return True


class InfrastructureAsCode:
    """Infraestrutura como Código (IaC)."""

    def __init__(self):
        self.resources: dict[str, dict] = {}
        self.state: dict[str, str] = {}

    def define_resource(self, name: str, resource_type: str, config: dict):
        self.resources[name] = {"type": resource_type, "config": config, "status": "defined"}

    def plan(self) -> list[str]:
        changes = []
        for name, resource in self.resources.items():
            if name not in self.state:
                changes.append(f"CREATE {name} ({resource['type']})")
            elif self.state[name] != str(resource["config"]):
                changes.append(f"UPDATE {name} ({resource['type']})")
        return changes

    def apply(self):
        for name, resource in self.resources.items():
            self.state[name] = str(resource["config"])
            resource["status"] = "created"
            print(f"[IaC] Applied: {name} ({resource['type']})")


class BlueGreenDeployer:
    """Deployer Blue-Green."""

    def __init__(self):
        self.blue: K8sPod | None = None
        self.green: K8sPod | None = None
        self.active = "blue"

    def deploy(self, new_version: str, containers: list[Container]):
        # Deploy to inactive environment
        inactive = "green" if self.active == "blue" else "blue"
        new_pod = K8sPod(f"{inactive}-deployment", containers)
        new_pod.deploy()

        # Health check
        if all(c.health for c in containers):
            # Switch traffic
            old_active = self.active
            self.active = inactive

            if old_active == "blue":
                self.blue = new_pod
            else:
                self.green = new_pod

            print(f"[Blue-Green] Switched from {old_active} to {inactive}")

            # Cleanup old environment
            if old_active == "blue" and self.blue:
                self.blue.delete()
            elif old_active == "green" and self.green:
                self.green.delete()
        else:
            print("[Blue-Green] Health check failed, rollback")
            new_pod.delete()


class CanaryDeployer:
    """Deployer Canary."""

    def __init__(self, total_pods: int = 10):
        self.total_pods = total_pods
        self.canary_pods: list[K8sPod] = []
        self.stable_pods: list[K8sPod] = []
        self.canary_percentage = 0

    def start_canary(self, canary_containers: list[Container], percentage: float = 10.0):
        self.canary_percentage = percentage
        n_canary = int(self.total_pods * percentage / 100)

        for i in range(n_canary):
            pod = K8sPod(f"canary-{i}", canary_containers)
            pod.deploy()
            self.canary_pods.append(pod)

        print(f"[Canary] Deployed {n_canary} canary pods ({percentage}%)")

    def promote(self):
        """Promove canary para stable."""
        for pod in self.canary_pods:
            self.stable_pods.append(pod)
        self.canary_pods = []
        self.canary_percentage = 0
        print("[Canary] Promoted to stable")

    def rollback(self):
        """Rollback de canary."""
        for pod in self.canary_pods:
            pod.delete()
        self.canary_pods = []
        self.canary_percentage = 0
        print("[Canary] Rolled back")


class ARKHEDeployer:
    """Deployer ARKHE: arkhe deploy --substrate 873 --target k8s"""

    def __init__(self):
        self.pods: dict[str, K8sPod] = {}
        self.pipelines: dict[str, CICDPipeline] = {}

    def deploy_substrate(
        self,
        substrate_id: str,
        image: str,
        strategy: DeploymentStrategy = DeploymentStrategy.ROLLING,
    ):
        print(f"\n[ARKHE Deploy] Deploying substrate {substrate_id}")
        print(f"  Image: {image}")
        print(f"  Strategy: {strategy.value}")

        # Build pipeline
        pipeline = CICDPipeline(f"deploy-{substrate_id}")
        pipeline.add_stage("build", ["docker build", "docker push"])
        pipeline.add_stage("test", ["unit tests", "integration tests"])
        pipeline.add_stage("deploy", [f"kubectl apply -f {substrate_id}.yaml"])

        success = pipeline.run()

        if success:
            container = Container(image)
            pod = K8sPod(f"arkhe-{substrate_id}", [container])
            pod.deploy()
            self.pods[substrate_id] = pod
            return True
        return False

    def status(self) -> dict:
        return {
            "pods": {k: v.status for k, v in self.pods.items()},
            "pipelines": {k: v.status for k, v in self.pipelines.items()},
        }


if __name__ == "__main__":
    # Test CI/CD
    pipeline = CICDPipeline("arkhe-core")
    pipeline.add_stage("build", ["npm install", "npm run build"])
    pipeline.add_stage("test", ["npm test", "npm run test:e2e"])
    pipeline.add_stage("deploy", ["docker build -t arkhe:latest .", "kubectl apply"])
    pipeline.run()

    # Test IaC
    iac = InfrastructureAsCode()
    iac.define_resource("arkhe-db", "postgres", {"version": "15", "storage": "100Gi"})
    iac.define_resource("arkhe-cache", "redis", {"version": "7", "memory": "2Gi"})
    print(f"[IaC] Plan: {iac.plan()}")
    iac.apply()

    # Test ARKHE Deployer
    deployer = ARKHEDeployer()
    deployer.deploy_substrate("873", "arkhe/core-foundations:latest", DeploymentStrategy.BLUE_GREEN)
    print(f"[ARKHE] Status: {deployer.status()}")
