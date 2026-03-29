---
"@x402/svm": minor
---

feat(svm): allow injecting RPC client into ExactSvmScheme

Added support for injecting custom RPC clients into ExactSvmScheme constructor, enabling advanced transport layer customization including failover, retry, rate-limit handling, and custom RPC endpoint priorities.

**Changes:**

- Added optional `rpc` field to `ClientSvmConfig` type for injecting custom RPC clients
- Modified `ExactSvmScheme.createPaymentPayload()` to use injected RPC client when provided
- Falls back to existing behavior (creating RPC client from rpcUrl/network) when no RPC client is injected
- Added comprehensive test coverage for RPC client injection functionality

**Use Case:**

Enables developers to compose custom transport layers for handling concurrent Solana payments with sophisticated RPC management strategies. Particularly useful for applications that need to:

- Implement failover across multiple RPC endpoints
- Add retry logic with exponential backoff
- Handle rate limiting from public Solana RPCs (100 req/10s limit)
- Use authenticated RPC providers with custom credentials
- Enable request coalescing for better performance under load

**Backward Compatibility:**

Fully backward compatible - existing code continues to work unchanged. The `rpc` field is optional and existing `rpcUrl` behavior is preserved as fallback.

**Example:**

```typescript
import { ExactSvmScheme } from '@x402/svm';
import { createSolanaRpc, mainnet } from '@solana/kit';

// Option 1: Existing behavior (unchanged)
const client = new ExactSvmScheme(signer, {
  rpcUrl: 'https://my-rpc.com'
});

// Option 2: NEW - Inject custom RPC client with failover
const customRpc = createSolanaRpcFromTransport(
  createFailoverTransport([
    'https://primary-rpc.com',
    'https://backup-rpc.com'
  ])
);

const client = new ExactSvmScheme(signer, {
  rpc: customRpc // Custom RPC takes precedence over rpcUrl
});
```

Resolves #1832