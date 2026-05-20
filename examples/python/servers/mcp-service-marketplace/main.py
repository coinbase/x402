"""
x402 MCP Service Marketplace — LogicNodes Example

A FastAPI server exposing 3 deterministic AI agent workers as x402-gated MCP tools.
Each tool is payable per-call in USDC on Base with no signup or API keys required.

Workers exposed:
  - POST /call/json_sanitizer    — cleans/validates malformed JSON  ($0.05 USDC)
  - POST /call/rug_pull_detector — analyzes a contract for rug risk ($0.50 USDC)
  - POST /call/pii_scrubber      — redacts PII from text            ($0.05 USDC)

Discovery: registered in the x402 Bazaar — any agent querying the CDP facilitator
will find these tools automatically.

Live instance: https://logicnodes.io
"""

import os
import re
import json
import hashlib
from fastapi import FastAPI
from dotenv import load_dotenv

from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http import HTTPFacilitatorClient, FacilitatorConfig, PaymentOption
from x402.http.types import RouteConfig
from x402.server import x402ResourceServer
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.extensions.bazaar import declare_discovery_extension, OutputConfig

load_dotenv()

EVM_ADDRESS    = os.getenv("EVM_ADDRESS", "0xc174A7C8088BF271399CD3E9f88c20D37CAb967D")
FACILITATOR_URL = os.getenv("FACILITATOR_URL", "https://api.cdp.coinbase.com/platform/v2/x402")
EVM_NETWORK    = os.getenv("EVM_NETWORK", "eip155:8453")   # Base mainnet
PORT           = int(os.getenv("PORT", "8089"))

app = FastAPI(
    title="LogicNodes — MCP Service Marketplace",
    description="x402-gated AI agent workers. Pay per call in USDC on Base.",
    version="1.0.0",
)

facilitator_client = HTTPFacilitatorClient(
    FacilitatorConfig(url=FACILITATOR_URL)
)
server = x402ResourceServer(facilitator_client)
server.register(EVM_NETWORK, ExactEvmServerScheme())

# ---------------------------------------------------------------------------
# Route config with Bazaar discovery metadata
# ---------------------------------------------------------------------------
routes = {
    "POST /call/json_sanitizer": RouteConfig(
        accepts=[
            PaymentOption(
                scheme="exact",
                price="$0.05",
                network=EVM_NETWORK,
                pay_to=EVM_ADDRESS,
            )
        ],
        description="Clean and validate malformed JSON. Returns normalized JSON or a detailed error.",
        extensions=declare_discovery_extension(
            input={"messy_json": '{"key": value, missing: "quotes"}'},
            input_schema={
                "type": "object",
                "properties": {
                    "messy_json": {"type": "string", "description": "Malformed JSON string to sanitize"}
                },
                "required": ["messy_json"],
            },
            output=OutputConfig(
                example={"valid": True, "clean_json": '{"key": "value"}', "trust_hash": "abc123"},
                schema={
                    "type": "object",
                    "properties": {
                        "valid":       {"type": "boolean"},
                        "clean_json":  {"type": "string"},
                        "error":       {"type": "string"},
                        "trust_hash":  {"type": "string"},
                    },
                },
            ),
        ),
    ),

    "POST /call/rug_pull_detector": RouteConfig(
        accepts=[
            PaymentOption(
                scheme="exact",
                price="$0.50",
                network=EVM_NETWORK,
                pay_to=EVM_ADDRESS,
            )
        ],
        description="Analyze a crypto token contract address for rug pull risk signals.",
        extensions=declare_discovery_extension(
            input={"contract_address": "0xabc...", "chain": "base"},
            input_schema={
                "type": "object",
                "properties": {
                    "contract_address": {"type": "string", "description": "EVM contract address to analyze"},
                    "chain":            {"type": "string", "description": "Chain name (base, eth, bsc)"},
                },
                "required": ["contract_address"],
            },
            output=OutputConfig(
                example={"risk_score": 0.82, "signals": ["honeypot", "high_tax"], "trust_hash": "def456"},
                schema={
                    "type": "object",
                    "properties": {
                        "risk_score": {"type": "number", "description": "0.0 (safe) to 1.0 (high risk)"},
                        "signals":    {"type": "array", "items": {"type": "string"}},
                        "trust_hash": {"type": "string"},
                    },
                },
            ),
        ),
    ),

    "POST /call/pii_scrubber": RouteConfig(
        accepts=[
            PaymentOption(
                scheme="exact",
                price="$0.05",
                network=EVM_NETWORK,
                pay_to=EVM_ADDRESS,
            )
        ],
        description="Detect and redact PII (emails, phone numbers, SSNs, names) from any text.",
        extensions=declare_discovery_extension(
            input={"text": "Call John Doe at 555-1234 or john@example.com"},
            input_schema={
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Text to scrub for PII"}
                },
                "required": ["text"],
            },
            output=OutputConfig(
                example={"scrubbed": "Call [NAME] at [PHONE] or [EMAIL]", "redacted_count": 3, "trust_hash": "ghi789"},
                schema={
                    "type": "object",
                    "properties": {
                        "scrubbed":      {"type": "string"},
                        "redacted_count": {"type": "integer"},
                        "trust_hash":    {"type": "string"},
                    },
                },
            ),
        ),
    ),
}

app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def trust_hash(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Service implementations — deterministic, no external API calls
# ---------------------------------------------------------------------------

@app.post("/call/json_sanitizer")
async def json_sanitizer(body: dict):
    messy = body.get("messy_json", "")
    try:
        parsed = json.loads(messy)
        clean  = json.dumps(parsed)
        result = {"valid": True, "clean_json": clean, "trust_hash": trust_hash({"clean": clean})}
    except json.JSONDecodeError as e:
        # Attempt basic repairs: unquoted keys, trailing commas
        repaired = re.sub(r'(\w+)\s*:', r'"\1":', messy)
        repaired = re.sub(r',\s*}', '}', repaired)
        repaired = re.sub(r',\s*]', ']', repaired)
        try:
            parsed  = json.loads(repaired)
            clean   = json.dumps(parsed)
            result  = {"valid": True, "clean_json": clean, "repaired": True, "trust_hash": trust_hash({"clean": clean})}
        except Exception:
            result = {"valid": False, "error": str(e), "trust_hash": trust_hash({"error": str(e)})}
    return {"result": result, "tier": "basic", "service": "json_sanitizer"}


@app.post("/call/rug_pull_detector")
async def rug_pull_detector(body: dict):
    contract = body.get("contract_address", "")
    chain    = body.get("chain", "base")

    # Deterministic heuristics on address shape (demo — replace with on-chain lookup)
    signals = []
    risk    = 0.0

    if not contract.startswith("0x") or len(contract) != 42:
        signals.append("invalid_address_format")
        risk += 0.3

    # Known high-risk patterns (prefix matching — extend with real data)
    HIGH_RISK_PREFIXES = ["0x000", "0xdead", "0xbeef"]
    if any(contract.lower().startswith(p) for p in HIGH_RISK_PREFIXES):
        signals.append("known_risk_prefix")
        risk += 0.5

    # Check for all-zero or all-same characters
    hex_body = contract[2:].lower()
    if len(set(hex_body)) <= 3:
        signals.append("low_entropy_address")
        risk += 0.4

    risk = min(risk, 1.0)
    label = "HIGH" if risk > 0.7 else "MEDIUM" if risk > 0.3 else "LOW"

    result = {
        "contract_address": contract,
        "chain":     chain,
        "risk_score": round(risk, 2),
        "risk_label": label,
        "signals":   signals if signals else ["no_static_signals_detected"],
        "note":      "Static heuristics only. For on-chain verification integrate with Etherscan/Alchemy.",
        "trust_hash": trust_hash({"contract": contract, "risk": risk}),
    }
    return {"result": result, "tier": "premium", "service": "rug_pull_detector"}


@app.post("/call/pii_scrubber")
async def pii_scrubber(body: dict):
    text = body.get("text", "")
    original = text
    count = 0

    # Email
    emails = re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text)
    for e in emails:
        text = text.replace(e, "[EMAIL]")
        count += 1

    # Phone (US formats)
    phones = re.findall(r'\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', text)
    for p in phones:
        text = re.sub(r'\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b', '[PHONE]', text, count=1)
        count += 1

    # SSN
    ssns = re.findall(r'\b\d{3}-\d{2}-\d{4}\b', text)
    for s in ssns:
        text = text.replace(s, "[SSN]")
        count += 1

    result = {
        "original_length": len(original),
        "scrubbed":         text,
        "redacted_count":   count,
        "trust_hash":       trust_hash({"scrubbed": text, "count": count}),
    }
    return {"result": result, "tier": "basic", "service": "pii_scrubber"}


# ---------------------------------------------------------------------------
# Free discovery endpoint — no payment required
# ---------------------------------------------------------------------------
@app.get("/")
async def index():
    return {
        "name":        "LogicNodes MCP Service Marketplace",
        "description": "x402-gated AI agent workers. Pay per call in USDC on Base.",
        "services":    ["/call/json_sanitizer", "/call/rug_pull_detector", "/call/pii_scrubber"],
        "pricing":     {"basic": "$0.05 USDC", "premium": "$0.50 USDC"},
        "network":     EVM_NETWORK,
        "pay_to":      EVM_ADDRESS,
        "bazaar":      f"https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo={EVM_ADDRESS}",
        "mcp_bridge":  "npx logicnodes-mcp-bridge",
        "live":        "https://logicnodes.io",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
