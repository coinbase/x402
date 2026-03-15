# Go Module Versioning and Release Process

This document describes the proper process for releasing Go modules from the x402 repository.

## Problem

The x402 Go module is located in the `/go` subdirectory, which requires special tagging conventions for Go modules. Improper tagging prevents users from upgrading to security fixes and creates confusion in dependency management.

## Go Module Tagging Rules

For a Go module located in a subdirectory (like `/go`), the tag format must be:

```
{subdirectory}/v{major}.{minor}.{patch}
```

For the x402 Go module at `/go`, tags should be:
- `go/v2.5.1` (correct)
- `go/v2.6.0` (correct) 
- `go-x402@v2.5.0` (incorrect)
- `go/v2.5.0` with invalid characters (incorrect)

## Current Issues

1. **Mixed tagging schemes**: Some tags use `go/v2.x.x` while others use `go-x402@v2.x.x`
2. **Invalid semver**: Go tools reject tags with invalid version syntax
3. **Security updates blocked**: Users cannot upgrade to patched versions

## Solution

### 1. Standardize on go/vX.Y.Z format

All future Go module releases should use the `go/v{major}.{minor}.{patch}` format.

### 2. Release Process

When creating a new Go module release:

1. Update version in `/go/VERSION` file (if present)
2. Update `/go/CHANGELOG.md` with changes
3. Create the tag with proper format:
   ```bash
   git tag go/v2.5.1
   git push origin go/v2.5.1
   ```

### 3. Verify Release

After tagging, verify the release works:

```bash
# Test module download
go mod download github.com/coinbase/x402/go@go/v2.5.1

# Test direct import
go get github.com/coinbase/x402/go@go/v2.5.1
```

## Migration Plan

To fix existing issues:

1. ✅ Create this documentation
2. 🔄 Add release automation script
3. 🔄 Update existing invalid tags (coordinate with team)
4. 🔄 Test with Go tools to ensure compatibility

## References

- [Go Modules Reference](https://go.dev/ref/mod#versions)
- [Module version numbering](https://go.dev/doc/modules/version-numbers)
- [Multi-module repositories](https://github.com/go-modules-by-example/index/blob/master/009_submodules/README.md)