#!/bin/bash
# ============================================================
# ARKHE LLM Server — Exemplos de Requisicoes curl
# Substrato: 836 + 829
# Arquiteto: ORCID 0009-0005-2697-4668
# ============================================================

BASE_URL="${ARKHE_SERVER_URL:-http://localhost:8080}"

echo "ARKHE LLM Server — Testes via curl"
echo "URL base: $BASE_URL"
echo ""

# --- 1. Health Check ---
echo "[1] Health Check:"
curl -s "$BASE_URL/health" | jq .
echo ""

# --- 2. Geracao Canonica — Substrato 226 ---
echo "[2] Geracao Canonica (Substrato 226):"
curl -s "$BASE_URL/completion" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "<|ARKHE_START|>\n<|SUBSTRATE|> 226\n<|INVARIANT|> I.1\n<|PHI_C|> 0.998\n\nQual e o status do Substrato 226?\n\n<|THOUGHT|>\n",
    "n_predict": 256,
    "temperature": 0.3,
    "top_p": 0.9,
    "repeat_penalty": 1.1,
    "stop": ["<|ARKHE_END|>"]
  }' | jq '.content'
echo ""

# --- 3. Geracao Canonica — Decreto ---
echo "[3] Geracao de Decreto (Substrato 999):"
curl -s "$BASE_URL/completion" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "<|ARKHE_START|>\n<|SUBSTRATE|> 999\n<|INVARIANT|> I.1, I.18\n<|PHI_C|> 0.999\n\nEmitir decreto de teste.\n\n<|THOUGHT|>\n",
    "n_predict": 512,
    "temperature": 0.2,
    "top_p": 0.9,
    "repeat_penalty": 1.15,
    "stop": ["<|ARKHE_END|>"]
  }' | jq '.content'
echo ""

# --- 4. Metricas ---
echo "[4] Metricas do Servidor:"
curl -s "$BASE_URL/metrics" | head -20
echo ""

# --- 5. Propriedades do Modelo ---
echo "[5] Propriedades do Modelo:"
curl -s "$BASE_URL/props" | jq .
echo ""

echo "Testes concluidos."