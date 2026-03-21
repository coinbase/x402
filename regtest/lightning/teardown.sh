#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
PURGE=false

for arg in "$@"; do
  case "$arg" in
    --purge)
      PURGE=true
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: bash regtest/lightning/teardown.sh [--purge]"
      exit 1
      ;;
  esac
done

if [ "$PURGE" = true ]; then
  docker compose -f "$COMPOSE_FILE" down --remove-orphans --volumes
  exit 0
fi

docker compose -f "$COMPOSE_FILE" down --remove-orphans
