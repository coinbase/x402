# Go Module Release Process

## Issue with Current Tagging

The x402 Go module currently has conflicting tag formats that prevent proper Go module resolution:

- Legacy tags: `go-x402@v2.1.0`, `go-x402@v2.2.0`, etc.
- New tags: `go/v2.5.0`

Go's module system expects submodule tags in the format `<submodule-path>/vX.Y.Z`.

## Correct Tag Format

For the x402 Go module located at `/go/`, tags should follow:

```
go/v2.6.0
go/v2.7.0
```

NOT:
```
go-x402@v2.6.0  # ❌ Legacy format
v2.6.0          # ❌ Root module format
```

## Release Steps

1. **Update Changelog**
   ```bash
   cd go/
   changie batch auto
   changie merge
   ```

2. **Commit Changes**
   ```bash
   git add .
   git commit -S -m "chore(go): release v2.6.0"
   ```

3. **Create Proper Tag**
   ```bash
   git tag -s go/v2.6.0 -m "Go SDK v2.6.0"
   ```

4. **Push Changes**
   ```bash
   git push origin main
   git push origin go/v2.6.0
   ```

## Tag Cleanup (Future)

To resolve the current conflicts, the legacy `go-x402@` tags should be deleted:

```bash
# Delete legacy tags (requires admin access)
git push --delete origin go-x402@v2.1.0
git push --delete origin go-x402@v2.2.0
git push --delete origin go-x402@v2.3.0
git push --delete origin go-x402@v2.4.1
git push --delete origin go-x402@v2.5.0
```

## Verification

After tagging, verify Go module resolution:

```bash
go list -m github.com/coinbase/x402/go@go/v2.6.0
govulncheck ./...
```

## Current Status

- Latest proper tag: `go/v2.5.0`
- Conflicting legacy tags: `go-x402@v2.1.0` through `go-x402@v2.5.0`
- Unreleased changes warrant v2.6.0 release