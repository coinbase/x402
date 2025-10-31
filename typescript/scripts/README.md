# Publishing Scripts

## publish-packages.sh

This script publishes all anyspend-x402 packages to npm with proper dependency conversion.

### What it does

1. **Builds** all packages using `pnpm build`
2. **Tests** all packages using `pnpm test`
3. **Verifies** package versions and configurations
4. **Publishes** each package to npm with proper `workspace:^` → version conversion

### Important: workspace:^ conversion

The source `package.json` files should **always** use `workspace:^` for internal dependencies:

```json
{
  "dependencies": {
    "@b3dotfun/anyspend-x402": "workspace:^"
  }
}
```

When you run `pnpm publish`, it automatically converts these to actual version ranges:

```json
{
  "dependencies": {
    "@b3dotfun/anyspend-x402": "^0.2.1"
  }
}
```

**Never manually edit** `workspace:^` to version numbers in source files!

### Usage

#### Dry-run (recommended first)

Test what will be published without actually publishing:

```bash
cd typescript
./scripts/publish-packages.sh --dry-run
```

Or:

```bash
cd typescript
DRY_RUN=true ./scripts/publish-packages.sh
```

#### Actual publish

Make sure you're logged in to npm first:

```bash
npm whoami  # Should show your npm username
```

If not logged in:

```bash
npm login
```

Then publish:

```bash
cd typescript
./scripts/publish-packages.sh
```

### Publishing order

The script publishes packages in this order to respect dependencies:

1. `@b3dotfun/anyspend-x402` (core package, no internal deps)
2. `@b3dotfun/anyspend-x402-fetch` (depends on core)
3. `@b3dotfun/anyspend-x402-express` (depends on core)
4. `x402-axios` (depends on core)
5. `x402-hono` (depends on core)
6. `x402-next` (depends on core)

### Troubleshooting

#### Error: "package not found in workspace"

This means the published packages still have `workspace:^` in them. This script fixes that by using `pnpm publish` which auto-converts.

#### Error: "You must be logged in to publish"

Run `npm login` first.

#### Error: "Version already published"

You need to bump the version in `package.json` before publishing. Update the version number and try again.

### Version bumping

Before publishing, update versions in the relevant `package.json` files:

- **Patch** (bug fixes): 0.2.1 → 0.2.2
- **Minor** (new features): 0.2.1 → 0.3.0
- **Major** (breaking changes): 0.2.1 → 1.0.0

Or use pnpm's version command:

```bash
cd packages/x402-fetch
pnpm version patch  # or minor, or major
```
