#!/bin/bash

# Script to publish all anyspend-x402 packages to npm
# This ensures workspace:^ dependencies are properly converted to version ranges

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Package directories - only anyspend-x402 packages
PACKAGES=(
  "packages/x402"
  "packages/x402-fetch"
  "packages/x402-express"
)

# Check if we're in dry-run mode
DRY_RUN=${DRY_RUN:-false}
if [ "$1" == "--dry-run" ]; then
  DRY_RUN=true
fi

echo -e "${GREEN}=== AnySpend x402 Package Publisher ===${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}Running in DRY-RUN mode (no actual publishing)${NC}"
  echo ""
fi

# Step 1: Build only the packages we're publishing
echo -e "${GREEN}Step 1: Building packages to publish...${NC}"
for pkg in "${PACKAGES[@]}"; do
  if [ -f "$pkg/package.json" ]; then
    PKG_NAME=$(node -p "require('./$pkg/package.json').name")
    echo "  Building $PKG_NAME..."
    (cd "$pkg" && pnpm build)
  fi
done
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Step 2: Run tests for packages being published (skip if SKIP_TESTS=true)
if [ "${SKIP_TESTS}" != "true" ]; then
  echo -e "${GREEN}Step 2: Running tests for packages being published...${NC}"
  for pkg in "${PACKAGES[@]}"; do
    if [ -f "$pkg/package.json" ]; then
      PKG_NAME=$(node -p "require('./$pkg/package.json').name")
      echo "  Testing $PKG_NAME..."
      (cd "$pkg" && pnpm test) || echo "  ⚠ Tests failed or not available for $PKG_NAME"
    fi
  done
  echo -e "${GREEN}✓ Tests complete${NC}"
  echo ""
else
  echo -e "${YELLOW}Step 2: Skipping tests (SKIP_TESTS=true)${NC}"
  echo ""
fi

# Step 3: Verify package versions and dependencies
echo -e "${GREEN}Step 3: Verifying package configurations...${NC}"
for pkg in "${PACKAGES[@]}"; do
  if [ -f "$pkg/package.json" ]; then
    PKG_NAME=$(node -p "require('./$pkg/package.json').name")
    PKG_VERSION=$(node -p "require('./$pkg/package.json').version")
    echo "  - $PKG_NAME@$PKG_VERSION"
  fi
done
echo ""

# Step 4: Confirm publish
if [ "$DRY_RUN" = false ]; then
  echo -e "${YELLOW}This will publish the above packages to npm.${NC}"
  echo -e "${YELLOW}Make sure you are logged in to npm (npm whoami)${NC}"
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Publish cancelled${NC}"
    exit 1
  fi
fi

# Step 5: Publish packages
echo -e "${GREEN}Step 5: Publishing packages...${NC}"
echo ""

for pkg in "${PACKAGES[@]}"; do
  if [ -f "$pkg/package.json" ]; then
    PKG_NAME=$(node -p "require('./$pkg/package.json').name")
    echo -e "${GREEN}Publishing $PKG_NAME...${NC}"

    cd "$pkg"

    if [ "$DRY_RUN" = true ]; then
      # Dry run - show what would be published
      echo -e "${YELLOW}[DRY-RUN] Would run: pnpm publish --access public --no-git-checks${NC}"

      # Show the package.json that would be published
      echo -e "${YELLOW}Dependencies that will be converted:${NC}"
      node -p "
        const pkg = require('./package.json');
        const deps = pkg.dependencies || {};
        Object.entries(deps)
          .filter(([_, version]) => version.startsWith('workspace:'))
          .map(([name, version]) => '  ' + name + ': ' + version)
          .join('\n') || '  (none)'
      "
    else
      # Real publish
      # pnpm publish automatically converts workspace:^ to the actual version
      pnpm publish --access public --no-git-checks
      echo -e "${GREEN}✓ Published $PKG_NAME${NC}"
    fi

    cd - > /dev/null
    echo ""
  fi
done

if [ "$DRY_RUN" = true ]; then
  echo -e "${GREEN}=== Dry-run complete ===${NC}"
  echo -e "${YELLOW}To actually publish, run: ./scripts/publish-packages.sh${NC}"
else
  echo -e "${GREEN}=== All packages published successfully! ===${NC}"
  echo ""
  echo -e "${YELLOW}Note: It may take a few minutes for packages to be available on npm${NC}"
fi
