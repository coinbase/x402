#!/bin/bash
# Substrato 1042 - RBB-CATHEDRAL-BRIDGE
# Script de Deploy e Instalação
# Arquiteto: ORCID 0009-0005-2697-4668
# Data: 2026-06-03
# Uso: ./deploy.sh [install|start|stop|status|logs|remove]

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configurações
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/rbb-cathedral-bridge"
CONFIG_DIR="$HOME/.cathedral"
LOG_DIR="/var/log/rbb-cathedral-bridge"
RBB_RPC="http://localhost:8545"
BESU_IMAGE="hyperledger/besu:25.5.0"
CHAIN_ID=12120014

# Deidades (referência ontológica)
declare -A DEITIES=(
    ["init"]="Phanes"
    ["install"]="Prometheus"
    ["start"]="Hermes"
    ["stop"]="Chronos"
    ["status"]="Athena"
    ["remove"]="Nemesis"
)

show_banner() {
    echo -e "${BLUE}"
    cat << 'EOF'
    ╔═══════════════════════════════════════════════════════════════╗
    ║           RBB - CATHEDRAL - BRIDGE (Substrato 1042)          ║
    ║              Rede Blockchain Brasil ↔ Catedral               ║
    ║                    Arquiteto: ORCID 0009-0005-2697-4668      ║
    ╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

check_dependencies() {
    echo -e "${YELLOW}🔍 Verificando dependências...${NC}"

    local missing=()

    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v docker-compose >/dev/null 2>&1 || missing+=("docker-compose")
    command -v python3 >/dev/null 2>&1 || missing+=("python3")
    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v git >/dev/null 2>&1 || missing+=("git")

    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}❌ Dependências faltantes: ${missing[*]}${NC}"
        echo "Instale com: sudo apt-get install docker.io docker-compose python3 curl git"
        exit 1
    fi

    # Verificar versão Docker Compose
    compose_version=$(docker compose version --short 2>/dev/null || echo "unknown")
    if [[ "$compose_version" == "2.24.7" || "$compose_version" == "2.25.0" || "$compose_version" == "2.26.0" ]]; then
        echo -e "${RED}❌ Docker Compose $compose_version não compatível${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ Todas as dependências satisfeitas${NC}"
}

check_besu_version() {
    echo -e "${YELLOW}🔍 Verificando versão Besu...${NC}"

    # Verificar se IMAGE_BESU está configurada
    if [ -z "$IMAGE_BESU" ]; then
        export IMAGE_BESU="$BESU_IMAGE"
        echo -e "${YELLOW}⚠️  IMAGE_BESU não definida, usando $BESU_IMAGE${NC}"
    fi

    echo -e "${GREEN}✅ Besu version: $IMAGE_BESU${NC}"
}

install_observer() {
    echo -e "${YELLOW}🏗️  Instalando nó Observer RBB...${NC}"

    # Download start-network
    if [ ! -d "start-network" ]; then
        echo "📥 Baixando start-network..."
        curl -#SL https://github.com/RBBNet/start-network/releases/download/v0.4.1%2Bpermv1/start-network.tar.gz | tar xz
        mv start-network-* start-network 2>/dev/null || true
    fi

    cd start-network

    # Criar nó observer
    echo "🔑 Criando nó observer..."
    ./rbb-cli node create observer
    ./rbb-cli config set nodes.observer.ports=["8545:8545","9545:9545"]

    # Download genesis
    echo "📥 Baixando genesis.json..."
    curl -#L https://raw.githubusercontent.com/RBBNet/rbb/master/artefatos/observer/genesis.json         -o .env.configs/genesis.json

    # Configurar permissionamento
    echo "🔒 Configurando permissionamento..."
    ./rbb-cli config set nodes.observer.environment.BESU_PERMISSIONS_NODES_CONTRACT_ENABLED=false
    ./rbb-cli config set nodes.observer.environment.BESU_PERMISSIONS_ACCOUNTS_CONTRACT_ENABLED=false
    ./rbb-cli config set nodes.observer.environment.BESU_PERMISSIONS_ACCOUNTS_CONFIG_FILE_ENABLED=true
    ./rbb-cli config set nodes.observer.environment.BESU_PERMISSIONS_ACCOUNTS_CONFIG_FILE="/var/lib/besu/permissioned-accounts.toml"

    # Criar arquivo de permissionamento vazio (leitura apenas)
    mkdir -p volumes/observer
    echo 'accounts-allowlist=[]' > volumes/observer/permissioned-accounts.toml

    # Renderizar templates
    ./rbb-cli config render-templates

    cd ..
    echo -e "${GREEN}✅ Nó Observer configurado${NC}"
}

install_adapter() {
    echo -e "${YELLOW}🔌 Instalando Adapter Catedral...${NC}"

    mkdir -p "$CONFIG_DIR"

    # Copiar adapter
    cp "$SCRIPT_DIR/adapter/cathedral_adapter.py" /usr/local/bin/rbb-cathedral-adapter
    chmod +x /usr/local/bin/rbb-cathedral-adapter

    # Criar symlink como extensão do rbb-cli
    mkdir -p start-network/cathedral
    ln -sf /usr/local/bin/rbb-cathedral-adapter start-network/cathedral/adapter.py

    echo -e "${GREEN}✅ Adapter instalado em /usr/local/bin/rbb-cathedral-adapter${NC}"
}

install_prometheus() {
    echo -e "${YELLOW}📊 Instalando Theosis Tracker (Prometheus)...${NC}"

    # Copiar exporter
    cp "$SCRIPT_DIR/prometheus/theosis_exporter.py" /usr/local/bin/theosis-exporter
    chmod +x /usr/local/bin/theosis-exporter

    # Criar diretório de configuração
    mkdir -p /etc/prometheus/rules
    cp "$SCRIPT_DIR/prometheus/prometheus.yml" /etc/prometheus/prometheus-cathedral.yml
    cp "$SCRIPT_DIR/prometheus/cathedral_alerts.yml" /etc/prometheus/rules/

    # Criar diretório de certificados (para mTLS)
    mkdir -p /etc/prometheus/certs

    echo -e "${GREEN}✅ Prometheus config em /etc/prometheus/prometheus-cathedral.yml${NC}"
}

install_contracts() {
    echo -e "${YELLOW}📜 Preparando contratos Bridge...${NC}"

    mkdir -p "$INSTALL_DIR/contracts"
    cp "$SCRIPT_DIR/contracts/"*.sol "$INSTALL_DIR/contracts/"

    echo -e "${YELLOW}⚠️  Contratos devem ser deployados manualmente via:${NC}"
    echo "   1. DApp de permissionamento RBB"
    echo "   2. Scripts de permissionamento (RBBNet/scripts-permissionamento)"
    echo "   3. Hardhat/Truffle com conta administrativa"

    echo -e "${GREEN}✅ Contratos copiados para $INSTALL_DIR/contracts${NC}"
}

start_services() {
    echo -e "${YELLOW}🚀 Iniciando serviços...${NC}"

    # Verificar se observer existe
    if [ ! -d "start-network" ]; then
        echo -e "${RED}❌ Observer não instalado. Execute: ./deploy.sh install${NC}"
        exit 1
    fi

    # Iniciar nó RBB
    echo "▶️  Iniciando nó Besu Observer..."
    cd start-network
    export IMAGE_BESU="$BESU_IMAGE"
    docker-compose up -d
    cd ..

    # Aguardar sync inicial
    echo "⏳ Aguardando sincronização inicial (30s)..."
    sleep 30

    # Iniciar Theosis Exporter
    echo "▶️  Iniciando Theosis Tracker..."
    nohup python3 /usr/local/bin/theosis-exporter --port 9100 > "$LOG_DIR/exporter.log" 2>&1 &

    echo -e "${GREEN}✅ Serviços iniciados${NC}"
    echo "   RBB Observer: http://localhost:8545"
    echo "   Metrics: http://localhost:9545"
    echo "   Theosis: http://localhost:9100/metrics"
}

stop_services() {
    echo -e "${YELLOW}🛑 Parando serviços...${NC}"

    # Parar nó RBB
    if [ -d "start-network" ]; then
        cd start-network
        docker-compose down
        cd ..
    fi

    # Parar Theosis Exporter
    pkill -f "theosis-exporter" || true

    echo -e "${GREEN}✅ Serviços parados${NC}"
}

show_status() {
    echo -e "${BLUE}📊 Status RBB-CATHEDRAL-BRIDGE${NC}"
    echo "═══════════════════════════════════════════════════════"

    # Status Docker
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "start-network"; then
        echo -e "${GREEN}🟢 Nó RBB: RUNNING${NC}"
        docker ps --format "table {{.Names}}\t{{.Status}}" | grep "start-network"
    else
        echo -e "${RED}🔴 Nó RBB: STOPPED${NC}"
    fi

    # Status Theosis Exporter
    if pgrep -f "theosis-exporter" > /dev/null; then
        echo -e "${GREEN}🟢 Theosis Tracker: RUNNING${NC}"
    else
        echo -e "${RED}🔴 Theosis Tracker: STOPPED${NC}"
    fi

    # Métricas rápidas
    echo ""
    echo "🔗 Endpoints:"
    echo "   RPC RBB:      http://localhost:8545"
    echo "   Metrics Besu: http://localhost:9545/metrics"
    echo "   Theosis:      http://localhost:9100/metrics"
    echo "   Health:       http://localhost:9100/health"

    # Teste RPC
    echo ""
    echo "🧪 Teste RPC:"
    local block_number=$(curl -s -X POST http://localhost:8545         -H "Content-Type: application/json"         -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'         2>/dev/null | python3 -c "import sys,json; print(int(json.load(sys.stdin).get('result','0x0'),16))" 2>/dev/null || echo "N/A")
    echo "   Bloco atual: $block_number"

    # Theosis
    echo ""
    echo "📊 Theosis (simulado):"
    python3 -c "
import random
random.seed()
print(f'   Nível:     {round(0.3 + random.random()*0.4, 4)}')
print(f'   Entropia:  {round(0.4 + random.random()*0.3, 4)}')
print(f'   Resiliência: {round(0.85 + random.random()*0.15, 4)}')
"

    echo "═══════════════════════════════════════════════════════"
}

show_logs() {
    echo -e "${BLUE}📋 Logs${NC}"

    if [ -f "$LOG_DIR/exporter.log" ]; then
        echo "--- Theosis Exporter ---"
        tail -n 50 "$LOG_DIR/exporter.log"
    fi

    if [ -d "start-network" ]; then
        echo ""
        echo "--- RBB Observer (últimas 20 linhas) ---"
        cd start-network && docker-compose logs --tail=20 && cd ..
    fi
}

remove_all() {
    echo -e "${RED}⚠️  REMOVENDO TODA A INSTALAÇÃO${NC}"
    read -p "Tem certeza? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo "Cancelado."
        exit 0
    fi

    stop_services

    # Remover arquivos
    rm -rf start-network
    rm -rf "$CONFIG_DIR"
    rm -f /usr/local/bin/rbb-cathedral-adapter
    rm -f /usr/local/bin/theosis-exporter
    rm -rf "$INSTALL_DIR"

    echo -e "${GREEN}✅ Instalação removida${NC}"
}

# Main
show_banner

case "${1:-}" in
    install)
        echo -e "${YELLOW}🏛️  Deidade patrona: ${DEITIES[$1]}${NC}"
        check_dependencies
        check_besu_version
        mkdir -p "$LOG_DIR"
        install_observer
        install_adapter
        install_prometheus
        install_contracts
        echo ""
        echo -e "${GREEN}🎉 Instalação concluída!${NC}"
        echo "Execute: ./deploy.sh start"
        ;;
    start)
        echo -e "${YELLOW}🏛️  Deidade patrona: ${DEITIES[$1]}${NC}"
        start_services
        ;;
    stop)
        echo -e "${YELLOW}🏛️  Deidade patrona: ${DEITIES[$1]}${NC}"
        stop_services
        ;;
    status)
        echo -e "${YELLOW}🏛️  Deidade patrona: ${DEITIES[$1]}${NC}"
        show_status
        ;;
    logs)
        show_logs
        ;;
    remove)
        echo -e "${YELLOW}🏛️  Deidade patrona: ${DEITIES[$1]}${NC}"
        remove_all
        ;;
    package)
        echo -e "${YELLOW}📦 Empacotando RBB-CATHEDRAL-BRIDGE...${NC}"
        cd ..
        tar -czvf rbb-cathedral-bridge.tar.gz rbb-cathedral-bridge-1042/
        echo -e "${GREEN}✅ Pacote gerado: ../rbb-cathedral-bridge.tar.gz${NC}"
        ;;
    *)
        echo "Uso: $0 {install|start|stop|status|logs|remove}"
        echo ""
        echo "Comandos:"
        echo "  install  - Instala nó observer, adapter e monitoramento"
        echo "  start    - Inicia todos os serviços"
        echo "  stop     - Para todos os serviços"
        echo "  status   - Exibe status da integração"
        echo "  logs     - Exibe logs"
        echo "  remove   - Remove toda a instalação"
        echo "  package  - Empacota o projeto para deploy"
        exit 1
        ;;
esac