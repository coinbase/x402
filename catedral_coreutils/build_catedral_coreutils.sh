#!/bin/bash
# Substrato 1028.x — Script de Build e Instalação das Extensões Coreutils
#
# Uso: ./build_catedral_coreutils.sh [python|rust|kernel|fuse|all]

set -e

CATEDRAL_VERSION="1028.1.0"
INSTALL_PREFIX="${INSTALL_PREFIX:-/opt/catedral}"
KERNEL_VERSION=$(uname -r)

echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║     BUILD CATEDRAL COREUTILS v${CATEDRAL_VERSION}                              ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_dep() {
    if command -v "$1" &> /dev/null; then
        log_info "$1 encontrado: $(command -v $1)"
        return 0
    else
        log_error "$1 não encontrado. Instale: $2"
        return 1
    fi
}

build_python() {
    log_info "=== Build Python Coreutils (1028) ==="

    check_dep "python3" "sudo apt-get install python3"
    check_dep "pip3" "sudo apt-get install python3-pip"

    mkdir -p "${INSTALL_PREFIX}/python"
    cp coreutils_catedral_1028.py "${INSTALL_PREFIX}/python/"

    # Criar symlink
    ln -sf "${INSTALL_PREFIX}/python/coreutils_catedral_1028.py" /usr/local/bin/catedral-coreutils-py

    log_info "Python Coreutils instalado em ${INSTALL_PREFIX}/python"
    log_info "Uso: catedral-coreutils-py"
}

build_rust() {
    log_info "=== Build Rust Coreutils (1028.1) ==="

    check_dep "cargo" "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    check_dep "rustc" "rustup default stable"

    # Verificar versão mínima do Rust
    RUST_VERSION=$(rustc --version | awk '{print $2}')
    log_info "Rust version: ${RUST_VERSION}"

    # Build release
    cargo build --release --bin catedral-coreutils --features rust-utils

    mkdir -p "${INSTALL_PREFIX}/bin"
    cp target/release/catedral-coreutils "${INSTALL_PREFIX}/bin/"

    # Criar symlinks para comandos individuais
    for cmd in cat cp mv rm ls mkdir df du wc head tail sort uniq grep sha256sum; do
        ln -sf "${INSTALL_PREFIX}/bin/catedral-coreutils" "/usr/local/bin/catedral-${cmd}"
    done

    log_info "Rust Coreutils instalado em ${INSTALL_PREFIX}/bin"
    log_info "Uso: catedral-cat, catedral-cp, catedral-rm, ..."
}

build_kernel() {
    log_info "=== Build Kernel Module (1028.2) ==="

    check_dep "make" "sudo apt-get install build-essential"
    check_dep "gcc" "sudo apt-get install gcc"

    if [ ! -d "/lib/modules/${KERNEL_VERSION}/build" ]; then
        log_error "Headers do kernel ${KERNEL_VERSION} não encontrados"
        log_info "Instale: sudo apt-get install linux-headers-${KERNEL_VERSION}"
        exit 1
    fi

    make clean || true
    make

    mkdir -p "${INSTALL_PREFIX}/kernel"
    cp catedral_fs.ko "${INSTALL_PREFIX}/kernel/"

    log_info "Kernel module compilado: ${INSTALL_PREFIX}/kernel/catedral_fs.ko"
    log_info "Carregamento: sudo insmod ${INSTALL_PREFIX}/kernel/catedral_fs.ko"
    log_info "Descarregamento: sudo rmmod catedral_fs"
}

build_fuse() {
    log_info "=== Build FUSE Filesystem (1028.3) ==="

    check_dep "cargo" "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    check_dep "fusermount" "sudo apt-get install fuse3"

    cargo build --release --bin catedral-fuse --features fuse-fs

    mkdir -p "${INSTALL_PREFIX}/bin"
    cp target/release/catedral-fuse "${INSTALL_PREFIX}/bin/"

    # Criar diretório de montagem
    mkdir -p /mnt/catedral

    log_info "FUSE filesystem instalado em ${INSTALL_PREFIX}/bin/catedral-fuse"
    log_info "Montagem: sudo ${INSTALL_PREFIX}/bin/catedral-fuse /mnt/catedral"
    log_info "Desmontagem: fusermount -u /mnt/catedral"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

TARGET="${1:-all}"

case "$TARGET" in
    python)
        build_python
        ;;
    rust)
        build_rust
        ;;
    kernel)
        build_kernel
        ;;
    fuse)
        build_fuse
        ;;
    all)
        log_info "Build completo de todas as extensões"
        build_python
        build_rust
        build_kernel
        build_fuse

        echo ""
        echo "╔═══════════════════════════════════════════════════════════════════════╗"
        echo "║     BUILD COMPLETO — CATEDRAL COREUTILS v${CATEDRAL_VERSION}                    ║"
        echo "╠═══════════════════════════════════════════════════════════════════════╣"
        echo "║  Python:  ${INSTALL_PREFIX}/python/coreutils_catedral_1028.py          ║"
        echo "║  Rust:    ${INSTALL_PREFIX}/bin/catedral-coreutils                    ║"
        echo "║  Kernel:  ${INSTALL_PREFIX}/kernel/catedral_fs.ko                    ║"
        echo "║  FUSE:    ${INSTALL_PREFIX}/bin/catedral-fuse                       ║"
        echo "╚═══════════════════════════════════════════════════════════════════════╝"
        ;;
    *)
        echo "Uso: $0 [python|rust|kernel|fuse|all]"
        exit 1
        ;;
esac

echo ""
log_info "Build concluído com sucesso!"
