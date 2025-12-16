.PHONY: all build test lint lint-fix fmt clean install help

# Variables
GOPATH := $(shell go env GOPATH)
GOBIN := $(GOPATH)/bin
GOLANGCI_LINT := $(GOBIN)/golangci-lint
GOLANGCI_LINT_VERSION := v2.7.2
MOCKGEN := $(GOBIN)/mockgen
GOIMPORTS := $(GOBIN)/goimports

# Default target
all: fmt lint test build

## help: Show this help message
help:
	@echo 'Usage:'
	@sed -n 's/^##//p' ${MAKEFILE_LIST} | column -t -s ':' |  sed -e 's/^/ /'

## build: Build the SDK
build:
	@echo "Building SDK..."
	@go build -v ./...

## test: Run unit tests
test:
	@echo "Running tests..."
	@go test -race -cover ./...

## test-cover: Run tests with coverage report
test-cover:
	@echo "Running tests with coverage..."
	@go test -race -coverprofile=coverage.out -covermode=atomic ./...
	@go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

## test-integration: Run integration tests
test-integration:
	@echo "Running integration tests..."
	@if [ -f .env ]; then \
		echo "Loading environment variables from .env..."; \
		export $$(grep -v '^#' .env | xargs) && go test -v -race -tags=integration ./test/integration/...; \
	else \
		echo "No .env file found, running without environment variables..."; \
		go test -v -race -tags=integration ./test/integration/...; \
	fi

## test-e2e: Run end-to-end tests
test-e2e:
	@echo "Running e2e tests..."
	@go test -race -tags=e2e ./test/e2e/...

## lint: Run linter
lint: $(GOLANGCI_LINT)
	@echo "Running linter..."
	@$(GOLANGCI_LINT) run ./...

## lint-fix: Run linter and auto-fix issues where possible
lint-fix: $(GOLANGCI_LINT)
	@echo "Running linter with auto-fix..."
	@$(GOLANGCI_LINT) run --fix ./...

## fmt: Format code
fmt: $(GOIMPORTS)
	@echo "Formatting code..."
	@go fmt ./...
	@$(GOIMPORTS) -w .

## clean: Clean build artifacts
clean:
	@echo "Cleaning..."
	@go clean -cache
	@rm -f coverage.out coverage.html
	@rm -rf dist/

## install: Install the SDK
install:
	@echo "Installing SDK..."
	@go install ./...

## deps: Install dependencies
deps:
	@echo "Installing dependencies..."
	@go mod download
	@go mod tidy

## deps-dev: Install development dependencies
deps-dev: $(GOLANGCI_LINT) $(MOCKGEN) $(GOIMPORTS)
	@echo "Development dependencies installed"

## generate: Generate code (mocks, etc.)
generate: $(MOCKGEN)
	@echo "Generating code..."
	@go generate ./...

## docs: Generate documentation
docs:
	@echo "Generating documentation..."
	@godoc -http=:6060 &
	@echo "Documentation server started at http://localhost:6060/pkg/github.com/coinbase/x402/go/"

## example-client: Run client example
example-client:
	@echo "Running client example..."
	@go run examples/client/basic/main.go

## example-server: Run server example
example-server:
	@echo "Running server example..."
	@go run examples/server/gin/main.go

## example-facilitator: Run facilitator example
example-facilitator:
	@echo "Running facilitator example..."
	@go run examples/facilitator/local/main.go

## verify: Run all checks (fmt, lint, test)
verify: fmt lint test

## release: Prepare for release
release: clean verify build
	@echo "Ready for release!"

# Tool installations
$(GOLANGCI_LINT):
	@echo "Installing golangci-lint $(GOLANGCI_LINT_VERSION)..."
	@go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)

$(MOCKGEN):
	@echo "Installing mockgen..."
	@go install github.com/golang/mock/mockgen@latest

$(GOIMPORTS):
	@echo "Installing goimports..."
	@go install golang.org/x/tools/cmd/goimports@latest

# Print variables for debugging
## vars: Print Makefile variables
vars:
	@echo "GOPATH: $(GOPATH)"
	@echo "GOBIN: $(GOBIN)"
	@echo "GOLANGCI_LINT: $(GOLANGCI_LINT)"
	@echo "MOCKGEN: $(MOCKGEN)"
	@echo "GOIMPORTS: $(GOIMPORTS)"
