.PHONY: all build test lint fmt check clean install dev docs bench release docker

RUSTFLAGS ?= "-C target-cpu=native"
CARGO := cargo
DOCKER := docker
PYTHON := python3

all: fmt lint test build

build:
	@echo "🏛️  Building Cathedral-LLM workspace..."
	$(CARGO) build --workspace

build-release:
	@echo "🏛️  Building Cathedral-LLM (release)..."
	RUSTFLAGS=$(RUSTFLAGS) $(CARGO) build --workspace --release

test:
	@echo "🏛️  Running all tests..."
	$(CARGO) test --workspace

lint:
	@echo "🏛️  Running clippy..."
	$(CARGO) clippy --workspace --all-targets --all-features -- -D warnings

fmt:
	@echo "🏛️  Formatting code..."
	$(CARGO) fmt --all

check:
	@echo "🏛️  Running cargo check..."
	$(CARGO) check --workspace

clean:
	@echo "🏛️  Cleaning build artifacts..."
	$(CARGO) clean
