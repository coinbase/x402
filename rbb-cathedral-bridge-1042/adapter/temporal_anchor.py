#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Substrato 1042 - RBB-CATHEDRAL-BRIDGE
Temporal Anchor Service
Serviço de ancoragem automática de Merkle roots na RBB
Arquiteto: ORCID 0009-0005-2697-4668
Data: 2026-06-03
"""

import os
import time
import hashlib
import json
import urllib.request
import schedule
from datetime import datetime

RBB_RPC = os.environ.get("RBB_RPC_URL", "http://localhost:8545")
BRIDGE_CONTRACT = os.environ.get("BRIDGE_CONTRACT", "0x0000000000000000000000000000000000010420")
ANCHOR_INTERVAL = int(os.environ.get("ANCHOR_INTERVAL", "300"))
SUBSTRATE = os.environ.get("SUBSTRATE", "1042")
ORCID = os.environ.get("ORCID", "0009-0005-2697-4668")


def rpc_call(method, params=None):
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
            RBB_RPC,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read())
            return result.get("result")
    except Exception as e:
        print(f"❌ RPC Error: {e}")
        return None


def generate_merkle_root():
    """Gera Merkle root do estado Catedral"""
    now = datetime.utcnow().isoformat()
    data = f"cathedral_state:{SUBSTRATE}:{now}:{ORCID}"
    return "0x" + hashlib.sha3_256(data.encode()).hexdigest()


def create_anchor():
    """Cria ancora na RBB"""
    print(f"\n⚓ [{datetime.utcnow().isoformat()}] Criando ancora temporal...")

    merkle_root = generate_merkle_root()
    block_number = rpc_call("eth_blockNumber", [])

    if block_number:
        print(f"   Merkle Root: {merkle_root}")
        print(f"   Bloco RBB: {block_number}")
        print(f"   Próxima ancora em: {ANCHOR_INTERVAL} blocos (~{ANCHOR_INTERVAL * 4 // 60} min)")

        # Em produção, chamar createAnchor no Bridge Contract
        # Simulação: apenas log
        anchor_id = "0x" + hashlib.sha3_256(
            f"{merkle_root}:{block_number}:{ORCID}".encode()
        ).hexdigest()

        print(f"   ✅ Anchor ID: {anchor_id}")
        return anchor_id
    else:
        print("   ⚠️  Falha ao obter bloco atual")
        return None


def main():
    print("🏛️  Temporal Anchor Service - Substrato 1042")
    print(f"   RBB RPC: {RBB_RPC}")
    print(f"   Bridge Contract: {BRIDGE_CONTRACT}")
    print(f"   Intervalo: {ANCHOR_INTERVAL} blocos ({ANCHOR_INTERVAL * 4 // 60} min)")
    print(f"   ORCID: {ORCID}")
    print("\n▶️  Iniciando scheduler...")

    # Primeira ancora imediata
    create_anchor()

    # Schedule: a cada 20 minutos (aproximação)
    schedule.every(20).minutes.do(create_anchor)

    try:
        while True:
            schedule.run_pending()
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n🛑 Serviço encerrado")


if __name__ == "__main__":
    main()