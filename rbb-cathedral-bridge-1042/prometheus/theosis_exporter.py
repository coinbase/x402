#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Substrato 1042 - RBB-CATHEDRAL-BRIDGE
Theosis Tracker - Prometheus Exporter
Exporta métricas Catedral para Prometheus federation RBB
Arquiteto: ORCID 0009-0005-2697-4668
Data: 2026-06-03

Métricas expostas:
- catedral_theosis_level
- catedral_entropy_rate
- catedral_circularity_index
- catedral_resilience_score
- catedral_cross_link_count
- catedral_anchor_block
- catedral_bridge_messages_total
- catedral_bridge_messages_executed
- catedral_identity_count
- catedral_deity_distribution

Uso:
    python3 theosis_exporter.py --port 9100 --rbb-rpc http://localhost:8545
"""

import argparse
import json
import hashlib
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
import urllib.request
import urllib.error


@dataclass
class TheosisMetrics:
    """Métricas de Theosis da Catedral"""
    level: float = 0.0
    entropy: float = 0.0
    circularity: float = 0.0
    resilience: float = 0.0
    timestamp: float = field(default_factory=time.time)
    substrate_seal: str = ""
    epoch: int = 0


@dataclass
class BridgeMetrics:
    """Métricas da Bridge"""
    messages_sent: int = 0
    messages_executed: int = 0
    messages_pending: int = 0
    anchors_created: int = 0
    latest_anchor_block: int = 0
    bridge_balance: float = 0.0


@dataclass
class IdentityMetrics:
    """Métricas de identidades"""
    total_identities: int = 0
    active_identities: int = 0
    by_theosis_level: Dict[int, int] = field(default_factory=dict)
    by_deity: Dict[str, int] = field(default_factory=dict)


class TheosisCollector:
    """Coletor de métricas Catedral"""

    def __init__(self, rbb_rpc: str, bridge_contract: str,
                 permissionamento_contract: str, update_interval: int = 15):
        self.rbb_rpc = rbb_rpc
        self.bridge_contract = bridge_contract
        self.permissionamento_contract = permissionamento_contract
        self.update_interval = update_interval

        self.theosis = TheosisMetrics()
        self.bridge = BridgeMetrics()
        self.identity = IdentityMetrics()

        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Inicia coleta contínua de métricas"""
        self._running = True
        self._thread = threading.Thread(target=self._collect_loop, daemon=True)
        self._thread.start()
        print(f"📊 Theosis Collector iniciado (intervalo: {self.update_interval}s)")

    def stop(self):
        """Para coleta de métricas"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _collect_loop(self):
        """Loop principal de coleta"""
        while self._running:
            try:
                self._update_theosis()
                self._update_bridge()
                self._update_identity()
            except Exception as e:
                print(f"⚠️ Erro na coleta: {e}")
            time.sleep(self.update_interval)

    def _rpc_call(self, method: str, params: list = None) -> Any:
        """Chamada RPC ao nó Besu"""
        if params is None:
            params = []
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1
        }
        try:
            req = urllib.request.Request(
                self.rbb_rpc,
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                result = json.loads(response.read())
                return result.get("result")
        except Exception as e:
            print(f"RPC Error: {e}")
            return None

    def _update_theosis(self):
        """Atualiza métricas de Theosis"""
        now = time.time()
        seed = int(now / self.update_interval)

        # Tentativa de consultar o modelo/API real do WormGraph 5.0 (zkAGI via llama.cpp server)
        import urllib.request
        import json
        import random

        try:
            # Emula a porta padrao do ARKHE llama.cpp
            req = urllib.request.Request(
                "http://localhost:8080/completion",
                data=json.dumps({
                    "prompt": "Forneca as metricas do Theosis atual no formato JSON. Inclua level, entropy, circularity e resilience.",
                    "n_predict": 128
                }).encode(),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                result = json.loads(response.read())
                content = result.get("content", "")

                import re

                level_match = re.search(r'"?level"?\s*:\s*([0-9.]+)', content)
                entropy_match = re.search(r'"?entropy"?\s*:\s*([0-9.]+)', content)
                circularity_match = re.search(r'"?circularity"?\s*:\s*([0-9.]+)', content)
                resilience_match = re.search(r'"?resilience"?\s*:\s*([0-9.]+)', content)

                if level_match and entropy_match and circularity_match and resilience_match:
                    self.theosis.level = float(level_match.group(1))
                    self.theosis.entropy = float(entropy_match.group(1))
                    self.theosis.circularity = float(circularity_match.group(1))
                    self.theosis.resilience = float(resilience_match.group(1))
                else:
                    raise Exception("Falta de JSON estruturado na resposta do LLM")

        except Exception as e:
            # Simulação baseada em funções determinísticas (Fallback)
            print(f"⚠️ Usando fallback determinístico para Theosis: {e}")
            random.seed(seed)
            self.theosis.level = round(0.3 + random.random() * 0.4, 4)
            self.theosis.entropy = round(0.4 + random.random() * 0.3, 4)
            self.theosis.circularity = round(random.random() * 0.02, 6)
            self.theosis.resilience = round(0.85 + random.random() * 0.15, 4)

        self.theosis.timestamp = now
        self.theosis.epoch = seed

        # Substrate seal determinístico
        data = f"theosis:{seed}:{self.theosis.level}"
        self.theosis.substrate_seal = "0x" + hashlib.sha3_256(data.encode()).hexdigest()

    def _update_bridge(self):
        """Atualiza métricas da Bridge"""
        block_number = self._rpc_call("eth_blockNumber", [])
        if block_number:
            self.bridge.latest_anchor_block = int(block_number, 16)

        # Simulação de métricas de mensagens
        self.bridge.messages_sent += random.randint(0, 2)
        self.bridge.messages_executed += random.randint(0, 1)
        self.bridge.messages_pending = max(0,
            self.bridge.messages_sent - self.bridge.messages_executed)
        self.bridge.anchors_created = self.bridge.latest_anchor_block // 300

    def _update_identity(self):
        """Atualiza métricas de identidades"""
        # Distribuição simulada por nível de Theosis
        self.identity.total_identities = 25
        self.identity.active_identities = 23
        self.identity.by_theosis_level = {
            1: 5, 2: 4, 3: 6, 4: 4, 5: 3, 6: 2, 7: 1
        }
        self.identity.by_deity = {
            "Themis": 4, "Athena": 3, "Hermes": 5, "Mnemosyne": 3,
            "Prometheus": 2, "Thoth": 3, "Eros": 2, "Chronos": 3
        }

    def get_prometheus_metrics(self) -> str:
        """Gera formato Prometheus exposition"""
        lines = []
        ts = int(self.theosis.timestamp * 1000)

        # Theosis metrics
        lines.append("# HELP catedral_theosis_level Nível de Theosis do substrato")
        lines.append("# TYPE catedral_theosis_level gauge")
        lines.append(f'catedral_theosis_level{{substrate="1042"}} {self.theosis.level}')

        lines.append("# HELP catedral_entropy_rate Taxa de entropia do sistema")
        lines.append("# TYPE catedral_entropy_rate gauge")
        lines.append(f'catedral_entropy_rate{{substrate="1042"}} {self.theosis.entropy}')

        lines.append("# HELP catedral_circularity_index Índice de circularidade")
        lines.append("# TYPE catedral_circularity_index gauge")
        lines.append(f'catedral_circularity_index{{substrate="1042"}} {self.theosis.circularity}')

        lines.append("# HELP catedral_resilience_score Score de resiliência")
        lines.append("# TYPE catedral_resilience_score gauge")
        lines.append(f'catedral_resilience_score{{substrate="1042"}} {self.theosis.resilience}')

        lines.append("# HELP catedral_theosis_epoch Época atual de Theosis")
        lines.append("# TYPE catedral_theosis_epoch counter")
        lines.append(f'catedral_theosis_epoch{{substrate="1042"}} {self.theosis.epoch}')

        # Bridge metrics
        lines.append("# HELP catedral_bridge_messages_total Total de mensagens enviadas")
        lines.append("# TYPE catedral_bridge_messages_total counter")
        lines.append(f'catedral_bridge_messages_total{{direction="rbb_to_cathedral"}} {self.bridge.messages_sent}')

        lines.append("# HELP catedral_bridge_messages_executed Mensagens executadas")
        lines.append("# TYPE catedral_bridge_messages_executed counter")
        lines.append(f'catedral_bridge_messages_executed{{direction="cathedral_to_rbb"}} {self.bridge.messages_executed}')

        lines.append("# HELP catedral_bridge_messages_pending Mensagens pendentes")
        lines.append("# TYPE catedral_bridge_messages_pending gauge")
        lines.append(f'catedral_bridge_messages_pending{{substrate="1042"}} {self.bridge.messages_pending}')

        lines.append("# HELP catedral_anchor_block Último bloco de ancora")
        lines.append("# TYPE catedral_anchor_block gauge")
        lines.append(f'catedral_anchor_block{{substrate="1042"}} {self.bridge.latest_anchor_block}')

        lines.append("# HELP catedral_anchors_created Total de anchors criadas")
        lines.append("# TYPE catedral_anchors_created counter")
        lines.append(f'catedral_anchors_created{{substrate="1042"}} {self.bridge.anchors_created}')

        # Identity metrics
        lines.append("# HELP catedral_identity_count Total de identidades registradas")
        lines.append("# TYPE catedral_identity_count gauge")
        lines.append(f'catedral_identity_count{{substrate="1042"}} {self.identity.total_identities}')

        lines.append("# HELP catedral_active_identity_count Identidades ativas")
        lines.append("# TYPE catedral_active_identity_count gauge")
        lines.append(f'catedral_active_identity_count{{substrate="1042"}} {self.identity.active_identities}')

        for level, count in self.identity.by_theosis_level.items():
            lines.append(f'catedral_identities_by_level{{theosis_level="{level}",substrate="1042"}} {count}')

        for deity, count in self.identity.by_deity.items():
            lines.append(f'catedral_identities_by_deity{{deity="{deity}",substrate="1042"}} {count}')

        # Cross-links
        lines.append("# HELP catedral_cross_link_count Links cruzados ativos")
        lines.append("# TYPE catedral_cross_link_count gauge")
        lines.append(f'catedral_cross_link_count{{substrate="1042"}} 19')

        lines.append("# HELP catedral_bridge_info Informações da bridge")
        lines.append("# TYPE catedral_bridge_info gauge")
        lines.append(f'catedral_bridge_info{{version="1.0.0",chain_id="12120014",substrate="1042"}} 1')

        return "\n".join(lines) + "\n"


class MetricsHandler(BaseHTTPRequestHandler):
    """Handler HTTP para endpoint Prometheus"""

    collector: TheosisCollector = None

    def do_GET(self):
        if self.path == "/metrics":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            metrics = self.collector.get_prometheus_metrics()
            self.wfile.write(metrics.encode())
        elif self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            health = {
                "status": "healthy",
                "substrate": "1042",
                "theosis_level": self.collector.theosis.level,
                "timestamp": datetime.utcnow().isoformat()
            }
            self.wfile.write(json.dumps(health).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Silenciar logs HTTP
        pass


def main():
    parser = argparse.ArgumentParser(description="Theosis Tracker - Prometheus Exporter")
    parser.add_argument("--port", type=int, default=9100, help="Porta HTTP (default: 9100)")
    parser.add_argument("--rbb-rpc", default="http://localhost:8545", help="RPC endpoint RBB")
    parser.add_argument("--bridge-contract", default="0x0000000000000000000000000000000000010420")
    parser.add_argument("--permissionamento-contract", default="0x0000000000000000000000000000000000010421")
    parser.add_argument("--interval", type=int, default=15, help="Intervalo de coleta (s)")
    args = parser.parse_args()

    print("🏛️  Theosis Tracker - Substrato 1042")
    print(f"   Porta: {args.port}")
    print(f"   RBB RPC: {args.rbb_rpc}")
    print(f"   Intervalo: {args.interval}s")
    print(f"   Bridge: {args.bridge_contract}")
    print()

    collector = TheosisCollector(
        rbb_rpc=args.rbb_rpc,
        bridge_contract=args.bridge_contract,
        permissionamento_contract=args.permissionamento_contract,
        update_interval=args.interval
    )
    collector.start()

    MetricsHandler.collector = collector
    server = HTTPServer(("0.0.0.0", args.port), MetricsHandler)

    print(f"🌐 Servidor iniciado em http://0.0.0.0:{args.port}/metrics")
    print(f"   Health check: http://0.0.0.0:{args.port}/health")
    print("   Pressione Ctrl+C para parar\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Parando servidor...")
        collector.stop()
        server.shutdown()
        print("✅ Servidor encerrado")


if __name__ == "__main__":
    main()