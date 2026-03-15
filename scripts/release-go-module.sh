#!/bin/bash

# Release script for x402 Go module
# Ensures proper semver tagging for Go modules in subdirectories

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODULE_DIR="go"
MODULE_NAME="github.com/coinbase/x402/go"

usage() {
    cat << EOF
Usage: $0 <version> [options]

Release a new version of the x402 Go module with proper semver tagging.

Arguments:
  version     Semantic version (e.g., v2.5.1, v2.6.0)

Options:
  --dry-run   Show what would be done without making changes
  --force     Skip confirmations (for CI use)
  --help      Show this help message

Examples:
  $0 v2.5.1
  $0 v2.6.0 --dry-run
  $0 v2.5.2 --force

EOF
}

log_info() {
    echo -e "${BLUE}INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}ERROR:${NC} $1" >&2
}

validate_version() {
    local version=$1
    
    # Check if version starts with v
    if [[ ! $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "Invalid version format: $version"
        log_error "Expected format: vX.Y.Z (e.g., v2.5.1)"
        exit 1
    fi
    
    # Extract major version
    local major=$(echo "$version" | cut -d. -f1 | sed 's/v//')
    
    # For major version 2+, ensure we're using the correct format
    if [[ $major -ge 2 ]]; then
        log_info "Major version $major detected - will use go/$version tag format"
    else
        log_warning "Major version $major - consider updating to v2+ for better Go module support"
    fi
}

check_working_directory() {
    if [[ ! -d "$MODULE_DIR" ]]; then
        log_error "Go module directory '$MODULE_DIR' not found"
        log_error "Please run this script from the x402 repository root"
        exit 1
    fi
    
    if [[ ! -f "$MODULE_DIR/go.mod" ]]; then
        log_error "go.mod not found in $MODULE_DIR"
        exit 1
    fi
}

check_git_status() {
    if [[ -n $(git status --porcelain) ]]; then
        log_error "Working directory is not clean"
        log_error "Please commit or stash your changes before releasing"
        exit 1
    fi
}

check_tag_exists() {
    local tag=$1
    
    if git rev-parse "$tag" >/dev/null 2>&1; then
        log_error "Tag '$tag' already exists"
        log_error "Please use a different version or delete the existing tag"
        exit 1
    fi
}

test_go_module() {
    local version=$1
    local tag="$MODULE_DIR/$version"
    
    log_info "Testing Go module syntax..."
    
    # Test that the module path is valid
    cd "$MODULE_DIR"
    
    # Verify go.mod is valid
    if ! go mod verify; then
        log_error "go.mod verification failed"
        exit 1
    fi
    
    # Run tests
    if ! go test ./...; then
        log_error "Go tests failed"
        exit 1
    fi
    
    cd ..
    
    log_success "Go module tests passed"
}

create_tag() {
    local version=$1
    local tag="$MODULE_DIR/$version"
    local dry_run=$2
    
    if [[ "$dry_run" == "true" ]]; then
        log_info "DRY RUN: Would create tag '$tag'"
        return
    fi
    
    log_info "Creating tag '$tag'..."
    
    # Create signed tag with message
    git tag -s "$tag" -m "Release $MODULE_NAME $version"
    
    log_success "Tag '$tag' created"
}

push_tag() {
    local version=$1
    local tag="$MODULE_DIR/$version"
    local dry_run=$2
    
    if [[ "$dry_run" == "true" ]]; then
        log_info "DRY RUN: Would push tag '$tag'"
        return
    fi
    
    log_info "Pushing tag '$tag'..."
    git push origin "$tag"
    
    log_success "Tag '$tag' pushed to origin"
}

verify_release() {
    local version=$1
    local tag="$MODULE_DIR/$version"
    local dry_run=$2
    
    if [[ "$dry_run" == "true" ]]; then
        log_info "DRY RUN: Would verify release availability"
        return
    fi
    
    log_info "Verifying release is available..."
    
    # Wait a moment for GitHub to process the tag
    sleep 5
    
    # Try to download the specific version
    if go mod download "$MODULE_NAME@$tag" >/dev/null 2>&1; then
        log_success "Release $tag is available and downloadable"
    else
        log_warning "Release may not be immediately available - this is normal"
        log_warning "Try: go get $MODULE_NAME@$tag"
    fi
}

main() {
    local version=""
    local dry_run="false"
    local force="false"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                dry_run="true"
                shift
                ;;
            --force)
                force="true"
                shift
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            v*)
                if [[ -n "$version" ]]; then
                    log_error "Multiple versions specified"
                    usage
                    exit 1
                fi
                version=$1
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    # Check required arguments
    if [[ -z "$version" ]]; then
        log_error "Version is required"
        usage
        exit 1
    fi
    
    log_info "Starting release process for $MODULE_NAME $version"
    
    # Validations
    validate_version "$version"
    check_working_directory
    check_git_status
    check_tag_exists "$MODULE_DIR/$version"
    
    # Tests
    test_go_module "$version"
    
    # Confirmation
    if [[ "$force" != "true" && "$dry_run" != "true" ]]; then
        echo
        log_warning "About to create and push tag: $MODULE_DIR/$version"
        read -p "Continue? [y/N]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Release cancelled"
            exit 0
        fi
    fi
    
    # Execute release
    create_tag "$version" "$dry_run"
    push_tag "$version" "$dry_run"
    verify_release "$version" "$dry_run"
    
    if [[ "$dry_run" == "true" ]]; then
        log_info "DRY RUN completed - no changes made"
    else
        log_success "Release $MODULE_DIR/$version completed successfully!"
        echo
        log_info "Users can now upgrade with:"
        log_info "  go get $MODULE_NAME@$MODULE_DIR/$version"
    fi
}

main "$@"