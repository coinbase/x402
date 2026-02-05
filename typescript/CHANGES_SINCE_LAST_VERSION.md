# TypeScript Changes Since Last Version Bump

**Last version bump:** `be253a872` - "chore: version typescript packages (#944)" - Jan 9, 2026

## Major Features & Changes

### Extensions Package (@x402/extensions)
- **#921** - `feat(extensions): SIWX Extension` - Sign-In-With-X extension for wallet-based authentication
- **Payment Identifier Extension** (multiple commits):
  - `737d9f020` - `feat(extensions): add payment-identifier types and schema`
  - `5b1f62f30` - `feat(extensions): add payment-identifier utility functions`
  - `ffb669615` - `feat(extensions): add payment-identifier client helper`
  - `7bb608151` - `feat(extensions): add payment-identifier resource server support`
  - `c3b472be0` - `feat(extensions): add payment-identifier validation and extraction`
  - `08aab64d6` - `feat(extensions): add payment-identifier barrel export`
  - `26c89d655` - `feat(extensions): export payment-identifier from package`
- `66ad7ea33` - `feat: add required & refactor client logic to append to extensions`

### MCP Package (@x402/mcp) - NEW PACKAGE
- **#1056** - `feat: added x402MCPClient, x402MCPServer, middleware, and examples`
- **#1076** - `feat: updated @x402/mcp to match updated spec`
- **#1083** - `Simplifying MCP SDK`
- `1a5e2e7a6` - `feat: added npm deploy workflow and set version to 2.2.0-alpha`
- `3c859385f` - `feat: updated @x402/mcp to match updated spec`
- `eca2de334` - `feat: updated to remove embedded errors`
- `86dfb5885` - `feat: improved MCP SDK interfaces`
- `3f7819cbd` - `feat: expose timeout, abort signal and reset timeout on progress options to x402MCPClient`
- `ed36002c6` - `feat: added integration test with SSE MCP`
- `83025baf8` - `feat: client side PR feedback`
- `3203a4f50` - `feat: pr feedback`

### Core Package (@x402/core)
- `073c01b05` - `feat(core,evm): add extensionData hook flow and spec-compliant EIP-2612 extension`
- `51bcc6314` - `feat(core): add extra field to ResourceConfig for assetTransferMethod`
- **#1030** - `feat(coinbase-x402): add error messages to Verify/Settle schemas`
- **#1010** - `Add onProtectedRequest hook`
- **#1012** - `OnPaymentRequired client-side hook`
- **#1003** - `New hooks for extensions to enrich payment-required and payment-response`

### EVM Package (@x402/evm)
- **#1038** - `feat: Add Permit2 facilitator support`
- **#1031** - `feat: add Permit2 client support with direct approval flow`
- **#1041** - `feat: Add Permit2 support to resource server SDK`
- Multiple commits for Permit2 implementation:
  - `18cc129a4` - `feat(evm): add Permit2 payload types and EIP-712 signing constants`
  - `c42e42004` - `feat(evm): add client-side Permit2 payload creation`
  - `b4775c5e4` - `feat(evm): add eip2612GasSponsoring extension support`
  - `e9ebbacd5` - `feat(evm): add Permit2 approval helpers`
  - `c9a2ae0cf` - `feat(evm): add Permit2 verification in facilitator`
  - `c1e476043` - `feat(evm): add Permit2 settle in facilitator`
- `073c01b05` - `feat(core,evm): add extensionData hook flow and spec-compliant EIP-2612 extension`
- **#818** - `fix(evm v1): fix missing EVM network support and add explicit errors for unsupported networks`
- `ec11c7344` - `feat: extract out common base from exact and upto contracts`

### SVM Package (@x402/svm)
- **#1048** - `Improve Solana payment throughput with memo-based uniqueness`
- **#991** - `feat(svm): allow Phantom and Solflare Lighthouse instructions in transaction verification`

### Fixes
- `8b4ddfdaf` - `fix: cleanup`
- `01dbe327b` - `fix: remove unknown directive`
- **#1018** - `fix: (Kobaru Facilitator) removed stray character causing JSON parsing error`
- **#982** - `fix: skip dynamic bazaar import when extension is pre-registered`
- **#940** - `fix discovery metadata`

### Infrastructure & Tooling
- **#1036** - `Add Changelog Management` - Added changesets CLI
- `1a5e2e7a6` - `feat: added npm deploy workflow and set version to 2.2.0-alpha`
- `92d523b28` - `chore: removed @x402/evm-contracts (as contracts/evm replaced)`
- `fe637d2d9` - `feat: initial draft of extensions`
- `d10fa74ea` - `feat: added and implemented @x402/evm-contracts`

## Summary by Package

### @x402/core
- Extension data hook flow
- EIP-2612 extension support
- Error message improvements
- New hooks for extensions

### @x402/extensions
- SIWX Extension (Sign-In-With-X)
- Payment Identifier Extension (complete implementation)
- Client logic improvements

### @x402/mcp (NEW)
- Initial alpha release
- MCP client and server implementations
- Middleware support
- Examples and integration tests

### @x402/evm
- Permit2 support (client, facilitator, resource server)
- EIP-2612 gas sponsoring extension
- EVM v1 fixes
- Contract refactoring

### @x402/svm
- Memo-based uniqueness improvements
- Phantom and Solflare Lighthouse instruction support

## Notes

- Many commits appear to be duplicates/rebases (especially Permit2-related commits)
- The MCP package is new and should have an initial changeset
- Extensions package has significant new features (SIWX + Payment Identifier)
- Core package has new hooks and extension support
- EVM package has major Permit2 feature additions
- SVM package has memo improvements

## Recommended Changesets Needed

Based on the changes above, you'll likely need changesets for:

1. **@x402/mcp** - Initial release (already created)
2. **@x402/extensions** - Minor (SIWX + Payment Identifier extensions)
3. **@x402/core** - Minor (new hooks, extension data support)
4. **@x402/evm** - Minor (Permit2 support, EIP-2612 extension)
5. **@x402/svm** - Minor (memo improvements, Lighthouse instructions)
6. Various packages - Patch (bug fixes)
