#!/bin/sh
# start-agent.sh
# Inicializa o agente Cathedral em Tiny Core Linux

AGENT_BIN="/opt/agent/bin/agent"
CONFIG_DIR="/mnt/persist/config"
DATA_DIR="/mnt/persist/data"
PID_FILE="/var/run/agent.pid"

start() {
    mkdir -p "$CONFIG_DIR" "$DATA_DIR"
    if [ ! -f "$CONFIG_DIR/agent.toml" ]; then
        cp /opt/agent/config/agent.toml.default "$CONFIG_DIR/agent.toml"
    fi
    $AGENT_BIN --config "$CONFIG_DIR/agent.toml" &
    echo $! > "$PID_FILE"
}

stop() {
    if [ -f "$PID_FILE" ]; then
        kill -TERM "$(cat $PID_FILE)" || true
        rm -f "$PID_FILE"
    fi
}

case "$1" in
    start) start ;;
    stop) stop ;;
    restart) stop; sleep 1; start ;;
    *) echo "Uso: $0 {start|stop|restart}" ;;
esac
