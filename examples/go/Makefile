# Makefile for Go examples - format, lint, and build checks
# Run from examples/go/ directory

.PHONY: format-check lint-check build-all deps-dev

GOPATH := $(shell go env GOPATH)
GOBIN := $(GOPATH)/bin
GOLANGCI_LINT := $(GOBIN)/golangci-lint
GOIMPORTS := $(GOBIN)/goimports

# Get parent go/Makefile's deps-dev to install golangci-lint and goimports
deps-dev:
	$(MAKE) -C ../../go deps-dev

## format-check: Verify all Go examples are formatted (CI)
format-check: deps-dev
	@echo "Checking format in Go examples..."
	@for dir in clients/*/ servers/*/ facilitator/*/; do \
		if [ -f "$$dir/go.mod" ]; then \
			echo "  Formatting $$dir"; \
			(cd "$$dir" && go fmt ./... && $(GOIMPORTS) -w .) || exit 1; \
		fi; \
	done
	@if [ -n "$$(git diff --name-only)" ]; then \
		echo "The following files are not properly formatted:"; \
		git diff --name-only; \
		exit 1; \
	fi

## lint-check: Verify all Go examples pass lint (CI)
lint-check: deps-dev
	@echo "Linting Go examples..."
	@for dir in clients/*/ servers/*/ facilitator/*/; do \
		if [ -f "$$dir/go.mod" ]; then \
			echo "  Linting $$dir"; \
			(cd "$$dir" && $(GOLANGCI_LINT) run ./...) || exit 1; \
		fi; \
	done

## build-all: Verify all Go examples compile
## Note: servers/advanced has multiple standalone example programs (each with main) in one dir; skip it
build-all:
	@echo "Building Go examples..."
	@for dir in clients/*/ servers/*/ facilitator/*/; do \
		if [ -f "$$dir/go.mod" ] && [ "$$dir" != "servers/advanced/" ] && [ "$$dir" != "servers/custom/" ]; then \
			echo "  Building $$dir"; \
			(cd "$$dir" && go build ./...) || exit 1; \
		fi; \
	done
