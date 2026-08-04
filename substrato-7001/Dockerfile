# ==============================================================================
# Substrato 7001 — x402 Payment Layer + Polar Integration
# Selo: CATHEDRAL-ARKHE-DOCKER-S7001-v2.0.0
# ==============================================================================

FROM rust:1.85-slim AS builder

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps
COPY Cargo.toml Cargo.lock ./
COPY substrato-7001/Cargo.toml substrato-7001/
RUN mkdir -p substrato-7001/src && \
    echo "fn main() {}" > substrato-7001/src/main.rs && \
    cargo build --release --manifest-path substrato-7001/Cargo.toml \
        --features ${FEATURES:-"webhooks,oss,metrics-export"} 2>/dev/null || true

# Build real
COPY substrato-7001/src substrato-7001/src
RUN touch substrato-7001/src/main.rs && \
    cargo build --release --manifest-path substrato-7001/Cargo.toml \
        --features ${FEATURES:-"webhooks,oss,metrics-export"}

# ==============================================================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder \
    /app/target/release/cathedral-x402-server \
    /usr/local/bin/

EXPOSE 8787 9097

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8787/health || exit 1

USER nobody
ENTRYPOINT ["cathedral-x402-server"]
