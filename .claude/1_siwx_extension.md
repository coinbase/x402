# Sign-In-With-X (SIWX) Extension Implementation Plan

## Overview

Implement the Sign-In-With-X (SIWX) extension for x402 v2, providing CAIP-122 standard wallet-based identity assertions. This extension allows clients to prove control of a wallet that may have previously paid for a resource, enabling servers to grant access without requiring repurchase.

**Spec References:**
- `typescript/site/CHANGELOG-v2.md` (lines 237-341)
- `typescript/packages/extensions/src/sign-in-with-x/TODO.md`

## Architecture

SIWX is a **server-client extension** (no facilitator involvement required per spec line 471). It follows the standard extension pattern with `info` + `schema` structure.

### Data Flow

```
Server                              Client
   |                                   |
   |-- 402 PaymentRequired ----------->|
   |   extensions: {                   |
   |     sign-in-with-x: {info, schema}|
   |   }                               |
   |                                   |
   |<-- SIGN-IN-WITH-X header ---------|
   |    (base64-encoded JSON proof)    |
   |                                   |
   |-- Verify signature locally -------|
   |-- 200 Success ------------------->|
```

## File Structure

```
typescript/packages/extensions/src/sign-in-with-x/
├── index.ts            # Public exports
├── types.ts            # Type definitions + SIGN_IN_WITH_X constant
├── schema.ts           # JSON Schema builder
├── server.ts           # ResourceServerExtension hook
├── declare.ts          # declareSIWxExtension() - server declaration helper
├── parse.ts            # parseSIWxHeader() - extract from request header
├── validate.ts         # validateSIWxMessage() - field/temporal validation
├── verify.ts           # verifySIWxSignature() - crypto verification
├── message.ts          # createSIWxMessage() - CAIP-122 message construction
├── sign.ts             # signSIWxMessage() - client signing
├── encode.ts           # encodeSIWxHeader() - base64 encode for header
└── client.ts           # createSIWxPayload() - complete client flow
```

## Type Definitions (`types.ts`)

```typescript
// Extension identifier
export const SIGN_IN_WITH_X = 'sign-in-with-x';

// Signature schemes per CHANGELOG-v2.md
export type SignatureScheme =
  | 'eip191'   // personal_sign (default for EVM EOAs)
  | 'eip712'   // typed data signing
  | 'eip1271'  // smart contract wallet verification
  | 'eip6492'  // counterfactual smart wallet verification
  | 'siws'     // Sign-In-With-Solana
  | 'sep10';   // Stellar SEP-10

// Server declares in PaymentRequired.extensions
export interface SIWxExtensionInfo {
  domain: string;           // Server's domain (derived from resourceUri)
  uri: string;              // Full resource URI
  statement?: string;       // Human-readable purpose
  version: string;          // Always "1" per CAIP-122
  chainId: string;          // CAIP-2 format: "eip155:8453"
  nonce: string;            // Cryptographic random (SDK auto-generates)
  issuedAt: string;         // ISO 8601 (SDK auto-generates)
  expirationTime?: string;  // Optional expiry (default: +5 min)
  notBefore?: string;       // Optional validity start
  requestId?: string;       // Optional correlation ID
  resources?: string[];     // Associated resources
  signatureScheme?: SignatureScheme;
}

export interface SIWxExtensionSchema {
  $schema: string;
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
}

export interface SIWxExtension {
  info: SIWxExtensionInfo;
  schema: SIWxExtensionSchema;
}

// Client proof (sent in SIGN-IN-WITH-X header)
export interface SIWxPayload extends SIWxExtensionInfo {
  address: string;    // Signing wallet address
  signature: string;  // Cryptographic signature
}

// Server declaration options
export interface DeclareSIWxOptions {
  resourceUri: string;
  statement?: string;
  version?: string;                      // Default: "1"
  network: `eip155:${string}` | `solana:${string}` | string;
  expirationTime?: string;               // Default: auto +5 min
  signatureScheme?: SignatureScheme;
}
```

## Server-Side Implementation

### 1. Declaration Helper (`declare.ts`)

```typescript
import { randomBytes } from 'crypto';
import type { SIWxExtension, DeclareSIWxOptions } from './types';
import { SIGN_IN_WITH_X } from './types';
import { buildSIWxSchema } from './schema';

/**
 * Server helper to declare SIWX authentication requirement.
 * Auto-generates nonce, issuedAt, and derives domain from URI.
 */
export function declareSIWxExtension(
  options: DeclareSIWxOptions
): Record<string, SIWxExtension> {
  const url = new URL(options.resourceUri);
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  const expirationTime = options.expirationTime ??
    new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const info: SIWxExtensionInfo = {
    domain: url.host,
    uri: options.resourceUri,
    statement: options.statement,
    version: options.version ?? '1',
    chainId: options.network,
    nonce,
    issuedAt,
    expirationTime,
    resources: [options.resourceUri],
    ...(options.signatureScheme && { signatureScheme: options.signatureScheme }),
  };

  return {
    [SIGN_IN_WITH_X]: {
      info,
      schema: buildSIWxSchema(),
    },
  };
}
```

### 2. JSON Schema Builder (`schema.ts`)

```typescript
import type { SIWxExtensionSchema } from './types';

/**
 * Build JSON Schema for SIWX extension validation.
 * Per CHANGELOG-v2.md lines 276-292.
 */
export function buildSIWxSchema(): SIWxExtensionSchema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      domain: { type: 'string' },
      address: { type: 'string' },
      statement: { type: 'string' },
      uri: { type: 'string', format: 'uri' },
      version: { type: 'string' },
      chainId: { type: 'string' },
      nonce: { type: 'string' },
      issuedAt: { type: 'string', format: 'date-time' },
      expirationTime: { type: 'string', format: 'date-time' },
      notBefore: { type: 'string', format: 'date-time' },
      requestId: { type: 'string' },
      resources: { type: 'array', items: { type: 'string', format: 'uri' } },
      signature: { type: 'string' },
    },
    required: ['domain', 'address', 'uri', 'version', 'chainId', 'nonce', 'issuedAt', 'signature'],
  };
}
```

### 3. Header Parsing (`parse.ts`)

```typescript
import type { SIWxPayload } from './types';

/**
 * Parse SIGN-IN-WITH-X header into structured payload.
 * Supports both base64-encoded (spec) and raw JSON (backwards compat).
 */
export function parseSIWxHeader(header: string): SIWxPayload {
  let jsonStr: string;

  // Try base64 decode first (spec-compliant)
  try {
    jsonStr = Buffer.from(header, 'base64').toString('utf-8');
    // Verify it's valid JSON
    JSON.parse(jsonStr);
  } catch {
    // Fall back to raw JSON (backwards compatibility)
    jsonStr = header;
  }

  try {
    const payload = JSON.parse(jsonStr) as SIWxPayload;

    // Validate required fields per schema
    const required = ['domain', 'address', 'uri', 'version', 'chainId', 'nonce', 'issuedAt', 'signature'];
    const missing = required.filter(f => !(f in payload) || !payload[f as keyof SIWxPayload]);

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    return payload;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid SIWX header: not valid JSON or base64');
    }
    throw error;
  }
}
```

### 4. Message Validation (`validate.ts`)

```typescript
import type { SIWxPayload } from './types';

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes per spec

export interface ValidationOptions {
  maxAge?: number;
  checkNonce?: (nonce: string) => boolean | Promise<boolean>;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate SIWX message fields (before signature verification).
 * Per CHANGELOG-v2.md validation rules (lines 318-329).
 */
export async function validateSIWxMessage(
  message: SIWxPayload,
  expectedResourceUri: string,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const expectedUrl = new URL(expectedResourceUri);
  const maxAge = options.maxAge ?? MAX_AGE_MS;

  // 1. Domain binding (spec: "domain field MUST match server's domain")
  if (message.domain !== expectedUrl.host) {
    return { valid: false, error: `Domain mismatch: expected ${expectedUrl.host}, got ${message.domain}` };
  }

  // 2. URI validation (spec: "uri and resources must refer to base url")
  if (!message.uri.startsWith(expectedUrl.origin)) {
    return { valid: false, error: `URI mismatch: expected ${expectedUrl.origin}` };
  }

  // 3. issuedAt validation (spec: "MUST be recent, recommended < 5 minutes")
  const issuedAt = new Date(message.issuedAt);
  if (isNaN(issuedAt.getTime())) {
    return { valid: false, error: 'Invalid issuedAt timestamp' };
  }

  const age = Date.now() - issuedAt.getTime();
  if (age > maxAge) {
    return { valid: false, error: `Message too old: ${Math.round(age/1000)}s > ${maxAge/1000}s limit` };
  }
  if (age < -60000) { // Allow 1 min clock skew
    return { valid: false, error: 'issuedAt is in the future' };
  }

  // 4. expirationTime validation (spec: "MUST be in the future")
  if (message.expirationTime) {
    const expiration = new Date(message.expirationTime);
    if (isNaN(expiration.getTime())) {
      return { valid: false, error: 'Invalid expirationTime' };
    }
    if (expiration < new Date()) {
      return { valid: false, error: 'Message expired' };
    }
  }

  // 5. notBefore validation (spec: "if present, MUST be in the past")
  if (message.notBefore) {
    const notBefore = new Date(message.notBefore);
    if (new Date() < notBefore) {
      return { valid: false, error: 'Message not yet valid (notBefore)' };
    }
  }

  // 6. Nonce validation (spec: "MUST be unique per session")
  if (options.checkNonce) {
    const nonceValid = await options.checkNonce(message.nonce);
    if (!nonceValid) {
      return { valid: false, error: 'Nonce validation failed (replay detected)' };
    }
  }

  return { valid: true };
}
```

### 5. Signature Verification (`verify.ts`)

```typescript
import { SiweMessage } from 'siwe';
import type { SIWxPayload, SignatureScheme } from './types';

export interface VerifyOptions {
  provider?: unknown;        // Web3 provider for EIP-1271/6492
  checkSmartWallet?: boolean;
}

export interface VerifyResult {
  valid: boolean;
  address?: string;  // Recovered/verified address (checksummed)
  error?: string;
}

/**
 * Verify SIWX signature cryptographically.
 * Currently supports EVM (eip191). Extensible for other schemes.
 */
export async function verifySIWxSignature(
  payload: SIWxPayload,
  options: VerifyOptions = {}
): Promise<VerifyResult> {
  try {
    // Parse CAIP-2 chainId
    const chainIdMatch = /^eip155:(\d+)$/.exec(payload.chainId);
    if (!chainIdMatch) {
      // TODO: Add support for solana:*, etc.
      return { valid: false, error: `Unsupported chainId namespace: ${payload.chainId}` };
    }
    const numericChainId = parseInt(chainIdMatch[1], 10);

    // Reconstruct SIWE message
    const siweMessage = new SiweMessage({
      domain: payload.domain,
      address: payload.address,
      statement: payload.statement,
      uri: payload.uri,
      version: payload.version,
      chainId: numericChainId,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      expirationTime: payload.expirationTime,
      notBefore: payload.notBefore,
      requestId: payload.requestId,
      resources: payload.resources,
    });

    // Verify signature
    const result = await siweMessage.verify({
      signature: payload.signature,
      ...(options.checkSmartWallet && options.provider && { provider: options.provider }),
    });

    if (!result.success) {
      return { valid: false, error: result.error?.message ?? 'Signature verification failed' };
    }

    return { valid: true, address: siweMessage.address };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}
```

### 6. ResourceServerExtension Hook (`server.ts`)

```typescript
import type { ResourceServerExtension } from '@x402/core/types';
import { SIGN_IN_WITH_X } from './types';

/**
 * Extension hook for x402ResourceServer.registerExtension().
 * Can enrich declarations based on transport context if needed.
 */
export const siwxResourceServerExtension: ResourceServerExtension = {
  key: SIGN_IN_WITH_X,

  enrichDeclaration: (declaration, _transportContext) => {
    // Pass through - server explicitly declares SIWX requirements
    // Could auto-derive domain from HTTP context in future
    return declaration;
  },
};
```

## Client-Side Implementation

### 7. Message Construction (`message.ts`)

```typescript
import type { SIWxExtensionInfo } from './types';

/**
 * Construct CAIP-122 compliant message string for signing.
 * Format per https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-122.md
 */
export function createSIWxMessage(
  serverInfo: SIWxExtensionInfo,
  address: string
): string {
  const lines: string[] = [];

  // Header
  lines.push(`${serverInfo.domain} wants you to sign in with your ${serverInfo.chainId} account:`);
  lines.push(address);
  lines.push('');

  // Statement (optional)
  if (serverInfo.statement) {
    lines.push(serverInfo.statement);
    lines.push('');
  }

  // Required fields
  lines.push(`URI: ${serverInfo.uri}`);
  lines.push(`Version: ${serverInfo.version}`);
  lines.push(`Chain ID: ${serverInfo.chainId}`);
  lines.push(`Nonce: ${serverInfo.nonce}`);
  lines.push(`Issued At: ${serverInfo.issuedAt}`);

  // Optional fields
  if (serverInfo.expirationTime) {
    lines.push(`Expiration Time: ${serverInfo.expirationTime}`);
  }
  if (serverInfo.notBefore) {
    lines.push(`Not Before: ${serverInfo.notBefore}`);
  }
  if (serverInfo.requestId) {
    lines.push(`Request ID: ${serverInfo.requestId}`);
  }

  // Resources
  if (serverInfo.resources && serverInfo.resources.length > 0) {
    lines.push('Resources:');
    for (const resource of serverInfo.resources) {
      lines.push(`- ${resource}`);
    }
  }

  return lines.join('\n');
}
```

### 8. Signing Helper (`sign.ts`)

```typescript
import type { WalletClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

export interface SignOptions {
  // Future: signatureScheme for EIP-712, etc.
}

/**
 * Sign SIWX message with wallet.
 */
export async function signSIWxMessage(
  message: string,
  signer: WalletClient | PrivateKeyAccount
): Promise<string> {
  // WalletClient (browser wallets)
  if ('account' in signer && 'signMessage' in signer) {
    const wallet = signer as WalletClient;
    if (!wallet.account) {
      throw new Error('Wallet account not connected');
    }
    return wallet.signMessage({
      account: wallet.account,
      message,
    });
  }

  // PrivateKeyAccount (server-side)
  if ('signMessage' in signer) {
    return (signer as PrivateKeyAccount).signMessage({ message });
  }

  throw new Error('Invalid signer type');
}
```

### 9. Header Encoding (`encode.ts`)

```typescript
import type { SIWxPayload } from './types';

/**
 * Encode SIWX payload for SIGN-IN-WITH-X header.
 * Uses base64 encoding per CHANGELOG-v2.md line 335.
 */
export function encodeSIWxHeader(payload: SIWxPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json).toString('base64');
}

/**
 * Encode SIWX payload as raw JSON (for environments without base64 requirement).
 */
export function encodeSIWxHeaderRaw(payload: SIWxPayload): string {
  return JSON.stringify(payload);
}
```

### 10. Complete Client Flow (`client.ts`)

```typescript
import type { WalletClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { SIWxExtensionInfo, SIWxPayload } from './types';
import { createSIWxMessage } from './message';
import { signSIWxMessage } from './sign';

/**
 * Complete client flow: construct message, sign, return payload.
 */
export async function createSIWxPayload(
  serverExtension: SIWxExtensionInfo,
  signer: WalletClient | PrivateKeyAccount
): Promise<SIWxPayload> {
  // Get address from signer
  let address: string;
  if ('account' in signer && signer.account) {
    address = signer.account.address;
  } else if ('address' in signer) {
    address = (signer as PrivateKeyAccount).address;
  } else {
    throw new Error('Cannot determine signer address');
  }

  // Construct CAIP-122 message
  const message = createSIWxMessage(serverExtension, address);

  // Sign message
  const signature = await signSIWxMessage(message, signer);

  // Return complete payload
  return {
    domain: serverExtension.domain,
    address,
    statement: serverExtension.statement,
    uri: serverExtension.uri,
    version: serverExtension.version,
    chainId: serverExtension.chainId,
    nonce: serverExtension.nonce,
    issuedAt: serverExtension.issuedAt,
    expirationTime: serverExtension.expirationTime,
    notBefore: serverExtension.notBefore,
    requestId: serverExtension.requestId,
    resources: serverExtension.resources,
    signature,
  };
}
```

## Public Exports (`index.ts`)

```typescript
/**
 * Sign-In-With-X Extension for x402 v2
 *
 * CAIP-122 compliant wallet authentication for payment-protected resources.
 */

// Extension identifier
export { SIGN_IN_WITH_X } from './types';

// Types
export type {
  SIWxExtension,
  SIWxExtensionInfo,
  SIWxExtensionSchema,
  SIWxPayload,
  DeclareSIWxOptions,
  SignatureScheme,
} from './types';

// Server exports
export { declareSIWxExtension } from './declare';
export { parseSIWxHeader } from './parse';
export { validateSIWxMessage, type ValidationResult, type ValidationOptions } from './validate';
export { verifySIWxSignature, type VerifyResult, type VerifyOptions } from './verify';
export { siwxResourceServerExtension } from './server';
export { buildSIWxSchema } from './schema';

// Client exports
export { createSIWxMessage } from './message';
export { signSIWxMessage, type SignOptions } from './sign';
export { createSIWxPayload } from './client';
export { encodeSIWxHeader, encodeSIWxHeaderRaw } from './encode';
```

## Dependencies

Add to `typescript/packages/extensions/package.json`:

```json
{
  "dependencies": {
    "siwe": "^2.3.0"
  }
}
```

## Testing Strategy

```typescript
// test/sign-in-with-x.test.ts

describe('Sign-In-With-X Extension', () => {
  describe('Server Side', () => {
    it('declareSIWxExtension generates valid extension with auto-fields');
    it('parseSIWxHeader handles base64 encoded input');
    it('parseSIWxHeader handles raw JSON for backwards compat');
    it('validateSIWxMessage rejects expired messages');
    it('validateSIWxMessage rejects domain mismatch');
    it('validateSIWxMessage rejects old issuedAt (> 5 min)');
    it('verifySIWxSignature validates EIP-191 signatures');
  });

  describe('Client Side', () => {
    it('createSIWxMessage generates CAIP-122 format');
    it('signSIWxMessage signs with PrivateKeyAccount');
    it('encodeSIWxHeader produces valid base64');
  });

  describe('Integration', () => {
    it('server can verify client-generated proof (full flow)');
  });
});
```

## Implementation Order

1. **Phase 1**: `types.ts`, `schema.ts` - Foundation
2. **Phase 2**: `declare.ts`, `parse.ts` - Server basics
3. **Phase 3**: `validate.ts`, `verify.ts` - Server validation
4. **Phase 4**: `message.ts`, `sign.ts`, `encode.ts`, `client.ts` - Client side
5. **Phase 5**: `server.ts`, `index.ts` - Integration + exports
6. **Phase 6**: Tests
7. **Phase 7**: Update `tsup.config.ts` for subpath export

## Package Export Configuration

Update `typescript/packages/extensions/tsup.config.ts`:

```typescript
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bazaar/index': 'src/bazaar/index.ts',
    'sign-in-with-x/index': 'src/sign-in-with-x/index.ts',  // Add this
  },
  // ...
});
```

Update `package.json` exports:

```json
{
  "exports": {
    "./sign-in-with-x": {
      "import": {
        "types": "./dist/esm/sign-in-with-x/index.d.mts",
        "default": "./dist/esm/sign-in-with-x/index.mjs"
      },
      "require": {
        "types": "./dist/cjs/sign-in-with-x/index.d.ts",
        "default": "./dist/cjs/sign-in-with-x/index.js"
      }
    }
  }
}
```
