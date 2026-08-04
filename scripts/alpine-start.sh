#!/bin/sh
# alpine-start.sh
# Script de inicialização do MCP Server em Alpine Linux
#
# Selo: CATHEDRAL-ARKHE-8000-ALPINE-START-v2.1.0-2026-06-19

set -e

BIN_PATH="/usr/local/bin/cathedral-headroom-mcp"
CONFIG_DIR="/etc/cathedral"
CONFIG_FILE="${CONFIG_DIR}/mcp.toml"
DATA_DIR="/var/lib/headroom"
LOG_DIR="/var/log/cathedral"
CCR_DIR="/mnt/persist/ccr"
PID_FILE="/var/run/cathedral-mcp.pid"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/cathedral-init.log
}

# Cria diretórios necessários
setup_directories() {
    log "Criando diretórios..."
    mkdir -p "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR" "$CCR_DIR" /mnt/persist
    chown -R cathedral:cathedral "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR" "$CCR_DIR" /mnt/persist 2>/dev/null || true
}

# Gera configuração padrão se não existir
ensure_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log "Gerando configuração padrão..."
        cat > "$CONFIG_FILE" <<EOF
[server]
address = "0.0.0.0"
port = 8787

[metrics]
enabled = true
port = 8788

[seal]
enabled = false
EOF
        chown cathedral:cathedral "$CONFIG_FILE"
    fi
}

start_mcp() {
    log "Iniciando Cathedral Headroom MCP Server..."

    if [ -f "$PID_FILE" ]; then
        OLD_PID=$(cat "$PID_FILE")
        if kill -0 "$OLD_PID" 2>/dev/null; then
            log "Processo já está rodando (PID $OLD_PID). Parando..."
            kill -TERM "$OLD_PID" || true
            sleep 2
        fi
        rm -f "$PID_FILE"
    fi

    if [ ! -x "$BIN_PATH" ]; then
        log "ERRO: Binário não encontrado ou não executável: $BIN_PATH"
        exit 1
    fi

    # Inicia o processo
    su cathedral -c "$BIN_PATH --config $CONFIG_FILE" &
    MCP_PID=$!
    echo "$MCP_PID" > "$PID_FILE"

    log "MCP Server iniciado (PID $MCP_PID)"

    # Aguarda estabilização
    sleep 3
    if kill -0 "$MCP_PID" 2>/dev/null; then
        log "MCP Server estável."
    else
        log "ERRO: MCP Server falhou ao iniciar."
        exit 1
    fi
}

stop_mcp() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill -TERM "$PID" || true
            log "MCP Server parado (PID $PID)"
        fi
        rm -f "$PID_FILE"
    fi
}

case "$1" in
    start)
        setup_directories
        ensure_config
        start_mcp
        ;;
    stop)
        stop_mcp
        ;;
    restart)
        stop_mcp
        sleep 1
        setup_directories
        ensure_config
        start_mcp
        ;;
    status)
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if kill -0 "$PID" 2>/dev/null; then
                echo "✅ MCP Server rodando (PID $PID)"
                exit 0
            else
                echo "❌ MCP Server parado (processo morto)"
                exit 1
            fi
        else
            echo "❌ MCP Server parado"
            exit 1
        fi
        ;;
    *)
        echo "Uso: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac