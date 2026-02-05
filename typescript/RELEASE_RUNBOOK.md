# Pre-Release Runbook for TypeScript Packages

This runbook describes the process for preparing and publishing TypeScript packages using Changesets and pnpm.

## Overview

We use [Changesets](https://github.com/changesets/changesets) to manage versioning and changelog generation across our monorepo packages. Changesets automatically:
- Bump package versions based on semantic versioning
- Update CHANGELOG.md files
- Update workspace dependencies
- Generate release notes

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 10.7.0
- All changes merged to `main` branch
- All tests passing (`pnpm test:all`)
- All changesets created for changes that need to be published

## Pre-Release Checklist

Before starting the release process:

- [ ] All PRs merged to `main`
- [ ] All tests passing: `pnpm test:all`
- [ ] All linting passing: `pnpm lint:check`
- [ ] All formatting passing: `pnpm format:check`
- [ ] Changesets exist for all changes that should be published
- [ ] Working directory is clean (`git status`)
- [ ] You're on the `main` branch (`git checkout main && git pull`)

## Step-by-Step Release Process

### Step 1: Verify Changesets

Check that all changesets are present and correct:

```bash
cd typescript
pnpm changeset status
```

This shows:
- Which packages have changesets
- Which packages will be published
- The version bumps that will occur

**If changesets are missing:**
- Create them with `pnpm changeset` (see [Creating Changesets](#creating-changesets))
- Commit the changeset files to the repository

### Step 2: Version Packages

Apply changesets to bump versions and update changelogs:

```bash
cd typescript
pnpm changeset version
```

This command:
- Reads all changeset files in `.changeset/`
- Determines version bumps (patch/minor/major) for each package
- Updates `package.json` versions
- Updates `CHANGELOG.md` files
- Deletes the consumed changeset files
- Updates workspace dependencies (based on `updateInternalDependencies: "patch"` in config)

**Review the changes:**
```bash
git status
git diff
```

You should see:
- Updated `package.json` files with new versions
- Updated `CHANGELOG.md` files
- Removed changeset files from `.changeset/`

### Step 3: Update Lockfile

After versioning, update the pnpm lockfile to reflect new workspace dependency versions:

```bash
cd typescript
pnpm install
```

This updates `pnpm-lock.yaml` with the new package versions from workspace dependencies.

**Verify lockfile changes:**
```bash
git diff pnpm-lock.yaml
```

You should see updated version references for workspace packages.

### Step 4: Build Packages

Build all packages to ensure everything compiles with the new versions:

```bash
cd typescript
pnpm build
```

**If build fails:**
- Fix any issues before proceeding
- You may need to update imports or dependencies
- Re-run `pnpm install` if dependencies changed

### Step 5: Run Tests

Run all tests to ensure nothing broke:

```bash
cd typescript
pnpm test:all
```

**If tests fail:**
- Fix issues before proceeding
- Consider reverting the version changes if needed: `git reset --hard HEAD`

### Step 6: Commit Version Changes

Commit the version bumps, changelogs, and lockfile:

```bash
cd typescript
git add .
git commit -m "chore: version packages"
```

**Commit message format:**
- Use `chore: version packages` or similar
- The changesets will generate detailed commit messages if you use `pnpm changeset version --commit`

### Step 7: Create Release PR (Optional but Recommended)

Create a PR with the version changes for review:

```bash
git push origin main
# Create PR on GitHub
```

This allows team review before publishing.

### Step 8: Publish Packages

Once the version changes are merged to `main`, publish packages to npm.

**Option A: Publish all changed packages at once**

```bash
cd typescript
pnpm publish -r --filter "./packages/**"
```

**Option B: Publish individual packages**

For more control, publish packages individually:

```bash
# Example: Publish @x402/core
cd typescript/packages/core
pnpm publish --provenance --access public

# Example: Publish @x402/next
cd typescript/packages/http/next
pnpm publish --provenance --access public
```

**Publish flags:**
- `--provenance`: Include provenance information (recommended for security)
- `--access public`: Required for scoped packages (`@x402/*`)
- `--dry-run`: Test without actually publishing

**Verify before publishing:**
```bash
# Check what will be published
pnpm publish --dry-run --access public
```

### Step 9: Create Git Tags (Optional)

After successful publishing, create git tags for the releases:

```bash
cd typescript
git tag -a "@x402/core@2.2.1" -m "Release @x402/core@2.2.1"
git push origin --tags
```

Or tag all published packages:
```bash
# Tag all packages that were versioned
git tag -a "v2.2.1" -m "Release v2.2.1"
git push origin --tags
```

## Creating Changesets

During development, create changesets for any change that should be published:

```bash
cd typescript
pnpm changeset
```

Follow the interactive prompts:
1. **Select packages** that changed (use space to select, enter to confirm)
2. **Choose release type:**
   - `patch`: Bug fixes, no API changes (1.0.0 → 1.0.1)
   - `minor`: New features, backward compatible (1.0.0 → 1.1.0)
   - `major`: Breaking changes (1.0.0 → 2.0.0)
3. **Write a summary** (past tense, e.g., "Fixed bug where X failed")

The changeset file will be created in `.changeset/` with a random name.

**Example changeset file** (`.changeset/my-change.md`):
```markdown
---
"@x402/core": patch
---

Fixed bug where payment validation failed for zero amounts
```

## Common Scenarios

### Publishing a Single Package

If you only need to publish one package:

1. Ensure it has a changeset: `pnpm changeset` (select only that package)
2. Version: `pnpm changeset version`
3. Update lockfile: `pnpm install`
4. Build: `pnpm build`
5. Publish: `cd packages/your-package && pnpm publish --provenance --access public`

### Publishing Multiple Related Packages

If packages depend on each other (e.g., `@x402/next` depends on `@x402/core`):

1. Create changesets for all affected packages
2. When versioning, changesets will automatically bump dependent packages
3. The `updateInternalDependencies: "patch"` config ensures workspace deps get patch bumps
4. Publish in dependency order (core first, then dependents)

### Reverting a Release

If you need to revert version changes before publishing:

```bash
git reset --hard HEAD~1  # Revert last commit
git clean -fd .changeset/  # Remove any new changeset files
```

### Checking What Will Be Published

Before versioning:
```bash
pnpm changeset status
```

After versioning:
```bash
# Check which packages have version changes
git diff --name-only | grep package.json

# Check version bumps
git diff packages/*/package.json | grep '"version"'
```

## Troubleshooting

### "No changesets found"

If `pnpm changeset version` says no changesets found:
- Check `.changeset/` directory for `.md` files
- Ensure changeset files are committed
- Run `pnpm changeset status` to verify

### Lockfile Conflicts

If `pnpm install` fails or shows conflicts:
- Ensure you're on the latest `main` branch
- Try `pnpm install --force`
- Check for merge conflicts in `pnpm-lock.yaml`

### Version Already Published

If npm says the version already exists:
- Check npm registry: `npm view @x402/core versions`
- Use `pnpm changeset status` to see what versions will be created
- You may need to create a new changeset with a higher bump

### Workspace Dependencies Not Updated

If workspace dependencies aren't updating:
- Check `.changeset/config.json` has `updateInternalDependencies: "patch"`
- Manually update dependency versions if needed
- Run `pnpm install` to sync lockfile

## Integration with CI/CD

The GitHub Actions workflows handle the actual publishing. After you:

1. Version packages (`pnpm changeset version`)
2. Update lockfile (`pnpm install`)
3. Commit and push to `main`

The workflows will:
- Build packages
- Publish to npm using OIDC authentication
- Use provenance for security

**Note:** The current workflows publish individual packages. Consider updating them to use `pnpm changeset publish` or `pnpm publish -r` for batch publishing.

## Quick Reference

```bash
# Check changeset status
pnpm changeset status

# Create a changeset
pnpm changeset

# Version packages (bumps versions, updates changelogs)
pnpm changeset version

# Update lockfile after versioning
pnpm install

# Build all packages
pnpm build

# Test all packages
pnpm test:all

# Publish a single package
cd packages/your-package
pnpm publish --provenance --access public

# Publish all changed packages
pnpm publish -r --filter "./packages/**"
```

## Additional Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Semantic Versioning](https://semver.org/)
- [CONTRIBUTING.md](./CONTRIBUTING.md) - General contributing guidelines
