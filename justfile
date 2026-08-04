# --- Polar Integration (adicionar ao justfile existente) ---

# Cria todos os produtos no Polar (dry run primeiro)
polar-products-dry:
    python3 scripts/create_polar_products.py --dry-run

# Cria todos os produtos no Polar (produção)
polar-products-create:
    python3 scripts/create_polar_products.py

# Inicia webhook server local
polar-webhooks:
    cargo run --bin cathedral-x402-server \
        --manifest-path substrato-7001/Cargo.toml \
        --features "webhooks,oss,metrics-export"

# Testa MCP Polar via stdin (manual)
polar-mcp-test:
    echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | \
    cargo run --bin cathedral-polar-mcp \
        --manifest-path substrato-7001/Cargo.toml \
        --features mcp-server --no-default-features 2>/dev/null | \
    jq .

# Lista ferramentas MCP Polar
polar-mcp-tools:
    echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
    cargo run --bin cathedral-polar-mcp \
        --manifest-path substrato-7001/Cargo.toml \
        --features mcp-server --no-default-features 2>/dev/null | \
    jq '.result.tools[].name'

# Simula webhook (requere POLAR_WEBHOOK_SECRET)
polar-webhook-simulate EVENT="order.paid":
    PAYLOAD='{"type":"{{EVENT}}","data":{"id":"ord_test_123","amount":4900,"customer":{"email":"test@cathedral.arkhe"},"product_id":"prod_test"}}' && \
    SIG=$$(echo -n "$$PAYLOAD" | openssl dgst -sha256 -hmac "$$POLAR_WEBHOOK_SECRET" -hex | awk '{print $$NF}') && \
    curl -s -X POST http://localhost:8787/webhooks/polar \
        -H "Content-Type: application/json" \
        -H "Polar-Signature: v1=$$SIG" \
        -d "$$PAYLOAD" | jq .

# Consulta DLQ (eventos que falharam)
polar-dlq:
    curl -s http://localhost:8787/webhooks/polar/dlq | jq .

# Roda testes de integração Polar
polar-test:
    cargo test --manifest-path substrato-7001/Cargo.toml \
        --features "webhooks,oss" \
        -- polar --nocapture
