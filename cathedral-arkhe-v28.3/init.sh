#!/bin/bash

# Cathedral ARKHE v28.3 Initialization Script

set -e

echo "=========================================="
echo "Initializing Cathedral ARKHE v28.3 Stack..."
echo "=========================================="

# 1. Create necessary directories for volumes
echo "[1/4] Creating volume directories..."
mkdir -p ./models
mkdir -p ./temporal-data
mkdir -p ./qdrant-data

# 2. Check for required dependencies
echo "[2/4] Checking dependencies..."
command -v docker >/dev/null 2>&1 || { echo >&2 "Docker is required but it's not installed. Aborting."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || command -v docker >/dev/null 2>&1 || { echo >&2 "Docker Compose is required but it's not installed. Aborting."; exit 1; }

# 3. Pull required images (optional, to speed up startup)
# echo "[3/4] Pulling Docker images..."
# cd runtime && docker-compose pull && cd ..

# 4. Start the stack
echo "[4/4] Starting the stack..."
cd runtime
# Ensure we use either 'docker-compose' or 'docker compose'
if docker compose version >/dev/null 2>&1; then
    docker compose up -d
else
    docker-compose up -d
fi

echo "=========================================="
echo "Cathedral ARKHE v28.3 Stack initialized successfully!"
echo "Services:"
echo "  - LLM Server: http://localhost:8000"
echo "  - Agent Runtime: http://localhost:8001"
echo "  - Vector DB (Qdrant): http://localhost:6333"
echo "  - Jaeger Telemetry: http://localhost:16686"
echo "=========================================="
