#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SUBSTRATO 880 — OBSERVABILITY-LAYER                      ║
║  Logs | Metrics | Tracing | Monitoring | Alerting | SLA/SLO/SLI              ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import random
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LogEntry:
    timestamp: float
    level: str
    message: str
    context: dict[str, Any] = field(default_factory=dict)
    trace_id: str | None = None
    span_id: str | None = None


class StructuredLogger:
    """Logger estruturado com níveis e contexto."""

    LEVELS = {"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40, "FATAL": 50}

    def __init__(self, service: str, min_level: str = "INFO"):
        self.service = service
        self.min_level = self.LEVELS[min_level]
        self.logs: deque = deque(maxlen=10000)

    def log(self, level: str, message: str, **context):
        if self.LEVELS[level] >= self.min_level:
            entry = LogEntry(
                timestamp=time.time(),
                level=level,
                message=message,
                context={"service": self.service, **context},
            )
            self.logs.append(entry)
            print(f"[{level}] {self.service}: {message}")

    def debug(self, msg: str, **ctx):
        self.log("DEBUG", msg, **ctx)

    def info(self, msg: str, **ctx):
        self.log("INFO", msg, **ctx)

    def warn(self, msg: str, **ctx):
        self.log("WARN", msg, **ctx)

    def error(self, msg: str, **ctx):
        self.log("ERROR", msg, **ctx)

    def query(self, level: str = None, time_range: tuple = None) -> list[LogEntry]:
        results = list(self.logs)
        if level:
            results = [e for e in results if e.level == level]
        if time_range:
            results = [e for e in results if time_range[0] <= e.timestamp <= time_range[1]]
        return results


@dataclass
class Metric:
    name: str
    value: float
    timestamp: float
    labels: dict[str, str] = field(default_factory=dict)


class MetricsCollector:
    """Coletor de métricas com agregação."""

    def __init__(self):
        self.metrics: dict[str, list[Metric]] = defaultdict(list)
        self.gauges: dict[str, float] = {}
        self.counters: dict[str, float] = defaultdict(float)

    def record(self, name: str, value: float, **labels):
        metric = Metric(name, value, time.time(), labels)
        self.metrics[name].append(metric)

    def gauge(self, name: str, value: float):
        self.gauges[name] = value

    def counter(self, name: str, delta: float = 1.0):
        self.counters[name] += delta

    def aggregate(self, name: str, window_seconds: float = 60.0) -> dict:
        now = time.time()
        recent = [m for m in self.metrics[name] if now - m.timestamp <= window_seconds]

        if not recent:
            return {}

        values = [m.value for m in recent]
        return {
            "count": len(values),
            "sum": sum(values),
            "avg": sum(values) / len(values),
            "min": min(values),
            "max": max(values),
            "p95": sorted(values)[int(len(values) * 0.95)] if len(values) > 20 else max(values),
        }


class DistributedTracer:
    """Tracer distribuído com spans e trace context."""

    def __init__(self):
        self.traces: dict[str, list[dict]] = {}
        self.current_trace: str | None = None

    def start_trace(self, name: str) -> str:
        trace_id = f"trace-{random.randint(100000, 999999)}"
        self.traces[trace_id] = []
        self.current_trace = trace_id
        self.start_span(name)
        return trace_id

    def start_span(self, name: str, parent_id: str = None):
        span = {
            "id": f"span-{random.randint(100000, 999999)}",
            "name": name,
            "parent_id": parent_id,
            "start_time": time.time(),
            "end_time": None,
            "tags": {},
        }
        self.traces[self.current_trace].append(span)
        return span["id"]

    def end_span(self, span_id: str):
        for span in self.traces.get(self.current_trace, []):
            if span["id"] == span_id:
                span["end_time"] = time.time()
                break

    def get_trace(self, trace_id: str) -> list[dict]:
        return self.traces.get(trace_id, [])

    def get_trace_duration(self, trace_id: str) -> float:
        trace = self.get_trace(trace_id)
        if not trace:
            return 0.0
        starts = [s["start_time"] for s in trace]
        ends = [s["end_time"] for s in trace if s["end_time"]]
        if starts and ends:
            return max(ends) - min(starts)
        return 0.0


class AlertManager:
    """Gerenciador de alertas com thresholds."""

    def __init__(self):
        self.rules: list[dict] = []
        self.alerts: deque = deque(maxlen=1000)
        self.alert_count = defaultdict(int)

    def add_rule(
        self, name: str, metric: str, threshold: float, operator: str = ">", duration: float = 60.0
    ):
        self.rules.append(
            {
                "name": name,
                "metric": metric,
                "threshold": threshold,
                "operator": operator,
                "duration": duration,
                "triggered_at": None,
            }
        )

    def evaluate(self, metrics: dict[str, float]):
        for rule in self.rules:
            value = metrics.get(rule["metric"])
            if value is None:
                continue

            triggered = False
            if rule["operator"] == ">" and value > rule["threshold"]:
                triggered = True
            elif rule["operator"] == "<" and value < rule["threshold"]:
                triggered = True

            if triggered:
                if rule["triggered_at"] is None:
                    rule["triggered_at"] = time.time()
                elif time.time() - rule["triggered_at"] >= rule["duration"]:
                    self._fire_alert(rule, value)
            else:
                rule["triggered_at"] = None

    def _fire_alert(self, rule: dict, value: float):
        alert = {
            "rule": rule["name"],
            "metric": rule["metric"],
            "value": value,
            "threshold": rule["threshold"],
            "timestamp": time.time(),
        }
        self.alerts.append(alert)
        self.alert_count[rule["name"]] += 1
        print(
            f"[ALERT] {rule['name']}: {rule['metric']}={value:.2f} (threshold: {rule['threshold']})"
        )


class SLAManager:
    """Gerenciador de SLA/SLO/SLI."""

    def __init__(self):
        self.slas: dict[str, dict] = {}
        self.slis: dict[str, list[float]] = defaultdict(list)

    def define_sla(self, service: str, slo: dict):
        """
        Define SLOs para um serviço.
        Ex: {"availability": 0.999, "latency_p95": 0.2, "error_rate": 0.001}
        """
        self.slas[service] = {"slo": slo, "breaches": []}

    def record_sli(self, service: str, metric: str, value: float):
        self.slis[f"{service}.{metric}"].append(value)

    def check_compliance(self, service: str) -> dict:
        if service not in self.slas:
            return {"error": "SLA not defined"}

        slo = self.slas[service]["slo"]
        results = {}

        for metric, target in slo.items():
            values = self.slis.get(f"{service}.{metric}", [])
            if values:
                actual = sum(values) / len(values)
                compliant = actual >= target if metric != "error_rate" else actual <= target
                results[metric] = {"target": target, "actual": actual, "compliant": compliant}

        return results


class ObservabilityPlatform:
    """Plataforma unificada de observabilidade."""

    def __init__(self, service_name: str):
        self.logger = StructuredLogger(service_name)
        self.metrics = MetricsCollector()
        self.tracer = DistributedTracer()
        self.alerts = AlertManager()
        self.sla = SLAManager()

    def instrument(self, func):
        """Decorator para instrumentação automática."""

        def wrapper(*args, **kwargs):
            trace_id = self.tracer.start_trace(func.__name__)
            start = time.time()

            try:
                result = func(*args, **kwargs)
                self.metrics.counter("requests.success")
                return result
            except Exception as e:
                self.metrics.counter("requests.error")
                self.logger.error(f"Function failed: {e}")
                raise
            finally:
                duration = time.time() - start
                self.metrics.record("request.duration", duration)
                self.tracer.end_span(self.tracer.traces[trace_id][0]["id"])

        return wrapper


if __name__ == "__main__":
    obs = ObservabilityPlatform("arkhe-gateway")

    # Test logging
    obs.logger.info("Gateway started", version="870-G.1.0")
    obs.logger.warn("High load detected", load=0.85)

    # Test metrics
    for _ in range(100):
        obs.metrics.record("request.duration", random.uniform(0.01, 0.5))
    print(f"[Metrics] p95 latency: {obs.metrics.aggregate('request.duration')['p95']:.3f}s")

    # Test alerts
    obs.alerts.add_rule("high_latency", "request.duration", 0.3, ">", 60)
    obs.alerts.evaluate({"request.duration": 0.35})

    # Test SLA
    obs.sla.define_sla("arkhe-gateway", {"availability": 0.999, "latency_p95": 0.2})
    for _ in range(1000):
        obs.sla.record_sli("arkhe-gateway", "availability", 1.0 if random.random() > 0.001 else 0.0)
    print(f"[SLA] Compliance: {obs.sla.check_compliance('arkhe-gateway')}")
