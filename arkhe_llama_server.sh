#!/bin/bash
# ============================================================
# arkhe_llama_server.sh — Servidor de Inferencia ARKHE (llama.cpp)
# Substrato: 829-PRELAUNCH-INTEGRATION-T0-BROADCAST (evolucao)
# Integracao: 836-ARKHE-GGUF-QUANTIZER + 583-OPEN-SUPERINTELLIGENCE-STACK
# Arquiteto: ORCID 0009-0005-2697-4668
# ============================================================

set -e

# --- CONFIGURACAO CANONICA ---
ARKHE_GGUF_PATH="${ARKHE_GGUF_PATH:-./arkhe-gguf-output/arkhe-8b-Q4_K_M.gguf}"
LLAMA_CPP_PATH="${LLAMA_CPP_PATH:-/tmp/llama.cpp}"
CONTEXT_LENGTH="${ARKHE_CONTEXT:-2048}"
THREADS="${ARKHE_THREADS:-4}"
PORT="${ARKHE_PORT:-8080}"
HOST="${ARKHE_HOST:-0.0.0.0}"

# Metadados ARKHE para injecao no servidor
ARKHE_VERSION="inf.Omega"
ARKHE_PHI_C="0.998"
ARKHE_ARCHITECT="0009-0005-2697-4668"

# --- VALIDACAO PRE-START ---

echo "============================================================"
echo "  ARKHE LLAMA.CPP SERVER — Inicializacao Canonica"
echo "============================================================"
echo "  Modelo:     $ARKHE_GGUF_PATH"
echo "  llama.cpp:  $LLAMA_CPP_PATH"
echo "  Contexto:   $CONTEXT_LENGTH tokens"
echo "  Threads:    $THREADS"
echo "  Porta:      $PORT"
echo "  Host:       $HOST"
echo "  Phi_C:      $ARKHE_PHI_C"
echo "============================================================"

# Verificar se o modelo existe
if [ ! -f "$ARKHE_GGUF_PATH" ]; then
    echo "[ERRO] Modelo GGUF nao encontrado: $ARKHE_GGUF_PATH"
    echo "[INFO] Execute primeiro: ./build_arkhe_gguf.sh"
    exit 1
fi

# Verificar se llama-server existe
SERVER_BIN="$LLAMA_CPP_PATH/build/bin/llama-server"
if [ ! -f "$SERVER_BIN" ]; then
    echo "[ERRO] llama-server nao encontrado: $SERVER_BIN"
    echo "[INFO] Compile llama.cpp: cmake -B build && cmake --build build"
    exit 1
fi

# --- COMPUTAR SELO DO MODELO ---
MODEL_SEAL=$(sha3sum "$ARKHE_GGUF_PATH" 2>/dev/null | cut -d' ' -f1 || \
    python3 -c "import hashlib; print(hashlib.sha3_256(open('$ARKHE_GGUF_PATH','rb').read()).hexdigest())")

echo "[INFO] Selo SHA3-256 do modelo: ${MODEL_SEAL:0:32}..."
echo "[INFO] Iniciando servidor..."
echo ""

# --- INICIAR SERVIDOR COM LD_LIBRARY_PATH ---
export LD_LIBRARY_PATH="$LLAMA_CPP_PATH/build/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

exec "$SERVER_BIN" \
    -m "$ARKHE_GGUF_PATH" \
    -c "$CONTEXT_LENGTH" \
    -t "$THREADS" \
    --port "$PORT" \
    --host "$HOST" \
    --path "$LLAMA_CPP_PATH/build/bin" \
    --metrics \
    --log-format json \
    2>&1 | tee -a "./arkhe_server_$(date +%Y%m%d_%H%M%S).log"
