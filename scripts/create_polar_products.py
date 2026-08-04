#!/usr/bin/env python3
"""
scripts/create_polar_products.py
Cria produtos digitais no Polar para cada serviço do Cathedral ARKHE.

v2.0.0: Usa httpx direto (não SDK hipotético), endpoints /v1/ corretos.

Uso:
    export POLAR_ACCESS_TOKEN="pol_live_..."
    export POLAR_ORGANIZATION_ID="org_..."
    python scripts/create_polar_products.py --dry-run   # preview
    python scripts/create_polar_products.py              # create

Selo: CATHEDRAL-ARKHE-POLAR-PRODUCTS-v2.0.0-2026-06-19
"""

import os
import sys
import json
import argparse
import hashlib
import hmac
from datetime import datetime, timezone

try:
    import httpx
except ImportError:
    print("❌ Instale httpx: pip install httpx")
    sys.exit(1)

POLAR_API_BASE = os.getenv("POLAR_API_URL", "https://api.polar.sh")

# ============================================================================
# PRODUTOS
# ============================================================================

PRODUCTS = [
    {
        "key": "audit_pro",
        "name": "Cathedral ARKHE — Audit Pro",
        "description": "Auditoria completa de smart contracts com ReAct Loop, análise de vulnerabilidades CWE e geração de ZK proof de correção",
        "is_recurring": True,
        "prices": [
            {"amount": 4900, "currency": "usd", "recurring_interval": "month"},
            {"amount": 49000, "currency": "usd", "recurring_interval": "year"},
        ],
    },
    {
        "key": "headroom_enterprise",
        "name": "Cathedral ARKHE — Headroom Enterprise",
        "description": "Compressão de contexto em larga escala (CCR + Cache Aligner) para LLMs via Substrato 8000",
        "is_recurring": True,
        "prices": [
            {"amount": 9900, "currency": "usd", "recurring_interval": "month"},
        ],
    },
    {
        "key": "tensorzkp_engine",
        "name": "Cathedral ARKHE — TensorZKP Engine",
        "description": "Geração e verificação de provas de conhecimento zero (secp256k1, groth16) com GPU offload via Substrato 4003",
        "is_recurring": False,
        "prices": [
            {"amount": 500, "currency": "usd"},   # pay-per-proof
            {"amount": 3900, "currency": "usd", "recurring_interval": "month"},  # subscription
        ],
    },
    {
        "key": "wormgraph_analytics",
        "name": "Cathedral ARKHE — WormGraph Analytics",
        "description": "Consultas analíticas em tempo real sobre proveniência on-chain/off-chain via Substrato 989.y",
        "is_recurring": True,
        "prices": [
            {"amount": 1900, "currency": "usd", "recurring_interval": "month"},
        ],
    },
    {
        "key": "hermes_gateway_pro",
        "name": "Cathedral ARKHE — Hermes Gateway Pro",
        "description": "Gateway multi-plataforma (Telegram, Discord, Slack, WhatsApp) com suporte MCP e monetização integrada",
        "is_recurring": True,
        "prices": [
            {"amount": 2900, "currency": "usd", "recurring_interval": "month"},
        ],
    },
    {
        "key": "edge_agent_cluster",
        "name": "Cathedral ARKHE — Edge Agent Cluster",
        "description": "Orquestração de múltiplos agents edge (Substrato 9000) com ReAct Loop, Hybrid Memory e MCP",
        "is_recurring": True,
        "prices": [
            {"amount": 4900, "currency": "usd", "recurring_interval": "month"},
            {"amount": 29900, "currency": "usd", "recurring_interval": "year"},
        ],
    },
    {
        "key": "donation",
        "name": "Cathedral ARKHE — Support OSS",
        "description": "Doação para financiar o desenvolvimento open-source da Cathedral ARKHE. 1% redistribuído automaticamente para contribuidores.",
        "is_recurring": False,
        "prices": [
            {"amount": 500, "currency": "usd"},
            {"amount": 1000, "currency": "usd"},
            {"amount": 2500, "currency": "usd"},
            {"amount": 5000, "currency": "usd"},
            {"amount": 10000, "currency": "usd"},
            {"amount": 25000, "currency": "usd"},
        ],
    },
]

# ============================================================================
# FUNÇÕES
# ============================================================================

def create_product(client: httpx.Client, product: dict) -> dict:
    """POST /v1/products — Cria produto no Polar"""
    resp = client.post(f"{POLAR_API_BASE}/v1/products", json={
        "name": product["name"],
        "description": product["description"],
        "is_recurring": product["is_recurring"],
        "prices": product["prices"],
    })
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description="Cria produtos Polar para Cathedral ARKHE")
    parser.add_argument("--dry-run", action="store_true", help="Preview sem criar")
    parser.add_argument("--output", default="polar_product_ids.json", help="Arquivo de saída")
    args = parser.parse_args()

    token = os.getenv("POLAR_ACCESS_TOKEN")
    if not token:
        print("❌ POLAR_ACCESS_TOKEN não definido")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {token}"}

    if args.dry_run:
        print("🔍 DRY RUN — Produtos que seriam criados:\n")
        total_prices = 0
        for p in PRODUCTS:
            for price in p["prices"]:
                total_prices += 1
                recurring = f"/{price.get('recurring_interval', 'one-time')}"
                print(f"  📦 {p['name']}")
                print(f"     ${price['amount']/100:.2f} USD {recurring}")
                print(f"     {p['description'][:80]}...")
                print()
        print(f"  Total: {len(PRODUCTS)} produtos, {total_prices} preços")
        return

    with httpx.Client(headers=headers, timeout=30) as client:
        results = {}
        for p in PRODUCTS:
            try:
                data = create_product(client, p)
                product_id = data.get("id", "unknown")
                results[p["key"]] = {
                    "id": product_id,
                    "name": p["name"],
                    "status": "created",
                    "prices": [pr.get("id") for pr in data.get("prices", [])],
                }
                print(f"✅ {p['key']}: {product_id}")
            except httpx.HTTPStatusError as e:
                error_body = e.response.text
                results[p["key"]] = {
                    "status": "error",
                    "error": error_body[:200],
                    "status_code": e.response.status_code,
                }
                print(f"❌ {p['key']}: {e.response.status_code} — {error_body[:100]}")

    with open(args.output, "w") as f:
        json.dump({
            "created_at": datetime.now(timezone.utc).isoformat(),
            "selo": "CATHEDRAL-ARKHE-POLAR-PRODUCTS-v2.0.0",
            "products": results,
        }, f, indent=2)

    print(f"\n📊 Resultado salvo em {args.output}")


if __name__ == "__main__":
    main()
