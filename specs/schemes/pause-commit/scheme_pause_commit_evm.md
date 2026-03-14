# Scheme: `pause-commit` on `EVM`

## Summary

The `pause-commit` scheme on EVM implements security-enhanced payments where clients sign off-chain EIP-712 payment intents and servers claim them atomically on-chain. This provides payer protection, address screening, and cancellation capabilities while maintaining zero gas costs for payment authorization.

The implementation uses the PAUSECommit smart contract with EIP-712 structured signatures and atomic settlement operations.

## Smart Contract Interface

### PAUSECommit Contract

**Mainnet Deployment**: `0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4` (Ethereum)  
**Verification**: [Etherscan](https://etherscan.io/address/0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4)

#### Core Functions

```solidity
interface PAUSECommit {
    struct PaymentIntent {
        address from;
        address to;
        uint256 amount;
        address asset;
        bytes32 nonce;
        uint256 deadline;
    }

    function commit(
        PaymentIntent calldata intent,
        bytes calldata signature
    ) external;

    function revoke(
        PaymentIntent calldata intent,
        bytes calldata signature
    ) external;

    function isNonceUsed(bytes32 nonce) external view returns (bool);
    function intentHash(PaymentIntent calldata intent) external view returns (bytes32);
}
```

#### Events

```solidity
event PaymentCommitted(
    bytes32 indexed intentHash,
    address indexed from,
    address indexed to,
    uint256 amount,
    address asset
);

event PaymentRevoked(
    bytes32 indexed intentHash,
    address indexed from
);
```

## EIP-712 Domain and Types

### Domain Separator

```json
{
  "name": "PAUSECommit",
  "version": "2",
  "chainId": 1,
  "verifyingContract": "0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4"
}
```

### Type Definitions

```json
{
  "types": {
    "EIP712Domain": [
      {"name": "name", "type": "string"},
      {"name": "version", "type": "string"},
      {"name": "chainId", "type": "uint256"},
      {"name": "verifyingContract", "type": "address"}
    ],
    "PaymentIntent": [
      {"name": "from", "type": "address"},
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "asset", "type": "address"},
      {"name": "nonce", "type": "bytes32"},
      {"name": "deadline", "type": "uint256"}
    ]
  },
  "primaryType": "PaymentIntent"
}
```

## Implementation Flow

### Phase 1: Payment Required Response

Server responds with 402 status and scheme specification:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
PAYMENT-REQUIRED: x402 {
  "version": 2,
  "url": "https://api.example.com/premium-data",
  "scheme": "pause-commit",
  "network": "eip155:1",
  "amount": "50000000",
  "asset": "0xA0b86a33E6441d45CF1C46cd3e5B4B8FA6a2dF1B",
  "payTo": "0x742d35Cc6634C0532925a3b8D951D75aC1FDF3fC",
  "maxTimeoutSeconds": 300,
  "extra": {
    "contractAddress": "0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4",
    "facilitatorUrl": "https://facilitator.pausesecure.com"
  }
}
```

### Phase 2: Risk Assessment

Client performs automatic address screening via PAUSE Risk Engine:

```typescript
import { createRiskGuard } from "@pausesecure/x402-risk/client";

const guard = createRiskGuard({ minScore: 40 });
const riskScore = await guard.scoreAddress(payTo);

if (riskScore < 40) {
  throw new Error(`High risk address detected: ${payTo} (score: ${riskScore})`);
}
```

### Phase 3: Payment Intent Creation

Client creates and signs EIP-712 payment intent:

```typescript
import { createPauseCommitClient } from "@pausesecure/x402-commit";

const client = createPauseCommitClient({
  network: "ethereum",
  contractAddress: "0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4"
});

const intent = {
  from: "0x857b06519E91e3A54538791bDbb0E22373e36b66",
  to: "0x742d35Cc6634C0532925a3b8D951D75aC1FDF3fC",
  amount: "50000000",
  asset: "0xA0b86a33E6441d45CF1C46cd3e5B4B8FA6a2dF1B",
  nonce: crypto.randomBytes(32),
  deadline: Math.floor(Date.now() / 1000) + 300 // 5 minutes
};

const signature = await client.signPaymentIntent(intent, signer);
```

### Phase 4: Payment Signature Header

Client retries request with signed payment intent:

```http
GET /premium-data HTTP/1.1
Host: api.example.com
PAYMENT-SIGNATURE: x402 {
  "scheme": "pause-commit",
  "signature": "0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c",
  "intent": {
    "from": "0x857b06519E91e3A54538791bDbb0E22373e36b66",
    "to": "0x742d35Cc6634C0532925a3b8D951D75aC1FDF3fC",
    "amount": "50000000",
    "asset": "0xA0b86a33E6441d45CF1C46cd3e5B4B8FA6a2dF1B",
    "nonce": "0x1234567890abcdef",
    "deadline": "1735689600"
  }
}
```

### Phase 5: Server Validation

Server validates the payment intent and signature:

```typescript
// 1. Verify EIP-712 signature
const recoveredAddress = verifyEIP712Signature(intent, signature);
if (recoveredAddress !== intent.from) {
  throw new Error("Invalid signature");
}

// 2. Verify intent parameters
if (intent.to !== expectedPayTo || intent.amount !== expectedAmount) {
  throw new Error("Intent parameters mismatch");
}

// 3. Verify deadline
if (intent.deadline < Date.now() / 1000) {
  throw new Error("Payment intent expired");
}

// 4. Verify nonce not used
const isUsed = await pauseCommitContract.isNonceUsed(intent.nonce);
if (isUsed) {
  throw new Error("Nonce already used");
}

// 5. Verify client balance and allowance
const balance = await tokenContract.balanceOf(intent.from);
const allowance = await tokenContract.allowance(intent.from, pauseCommitAddress);
if (balance < intent.amount || allowance < intent.amount) {
  throw new Error("Insufficient balance or allowance");
}
```

### Phase 6: Atomic Settlement

Server commits the payment on-chain:

```typescript
const tx = await pauseCommitContract.commit(intent, signature, {
  gasLimit: 150000 // ~85k actual + safety margin
});

await tx.wait();
```

### Phase 7: Service Delivery

Server delivers the requested resource:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "data": "premium market intelligence data",
  "txHash": "0x1a2b3c4d5e6f..."
}
```

## Cancellation Flow

If service is not delivered within deadline, client can revoke:

```typescript
const revokeTx = await pauseCommitContract.connect(clientSigner).revoke(intent, signature);
await revokeTx.wait();
```

This prevents the server from later claiming the payment.

## Gas Costs

| Operation | Gas Cost | Who Pays |
|-----------|----------|----------|
| EIP-712 Signing | 0 | Client |
| Payment Commitment | ~85,000 | Server/Facilitator |
| Payment Revocation | ~45,000 | Client |

## Security Validations

### Client-Side Validations

1. **Risk Score Check**: Verify `payTo` address score ≥ configured threshold
2. **Balance Verification**: Ensure sufficient balance and allowance
3. **Deadline Validation**: Confirm reasonable deadline (not too far in future)
4. **Nonce Uniqueness**: Generate cryptographically secure random nonce
5. **Signature Security**: Use secure signing with proper domain separation

### Server-Side Validations

1. **Signature Verification**: Recover signer and verify against `intent.from`
2. **Parameter Matching**: Verify `to`, `amount`, `asset` match requirements
3. **Deadline Check**: Ensure intent not expired
4. **Nonce Uniqueness**: Verify nonce not previously used
5. **Balance/Allowance**: Confirm client can cover payment
6. **Contract State**: Simulate `commit()` call before execution

### Smart Contract Protections

1. **Signature Replay Protection**: Nonce tracking prevents reuse
2. **Deadline Enforcement**: Expired intents automatically fail
3. **Atomic Settlement**: Payment and commitment are atomic
4. **Address Validation**: Signature must match `from` address
5. **Reentrancy Protection**: Standard reentrancy guards

## Error Handling

### Common Error Codes

| Error | Description | Mitigation |
|-------|-------------|------------|
| `SIGNATURE_INVALID` | EIP-712 signature verification failed | Regenerate signature with correct parameters |
| `INTENT_EXPIRED` | Payment intent past deadline | Create new intent with future deadline |
| `NONCE_USED` | Nonce already consumed | Generate new unique nonce |
| `INSUFFICIENT_BALANCE` | Client lacks sufficient token balance | Client must acquire tokens or reduce amount |
| `INSUFFICIENT_ALLOWANCE` | Token allowance too low | Client must approve PAUSECommit contract |
| `HIGH_RISK_ADDRESS` | `payTo` address flagged by risk engine | Server must use different address |
| `COMMITMENT_FAILED` | On-chain commitment transaction failed | Retry with higher gas or check network status |

## Facilitator Integration

### Required Endpoints

1. **`/verify`** - Validate payment intent and signature
2. **`/settle`** - Execute on-chain settlement
3. **`/status`** - Check payment status by intent hash

### Example Facilitator API

```typescript
// POST /verify
interface VerifyRequest {
  intent: PaymentIntent;
  signature: string;
}

interface VerifyResponse {
  valid: boolean;
  intentHash: string;
  errors?: string[];
}

// POST /settle  
interface SettleRequest {
  intent: PaymentIntent;
  signature: string;
}

interface SettleResponse {
  txHash: string;
  intentHash: string;
  settled: boolean;
}
```

## Network Deployment Addresses

| Network | Chain ID | Contract Address | Status |
|---------|----------|------------------|--------|
| Ethereum Mainnet | 1 | `0x604152D82Fd031cCD8D27F26C5792AC2CD328bF4` | ✅ Deployed |
| Base Mainnet | 8453 | TBD | 🔄 Planned Q2 2026 |
| Arbitrum One | 42161 | TBD | 🔄 Planned Q2 2026 |
| Polygon | 137 | TBD | 🔄 Planned Q3 2026 |

## Implementation Examples

### Client Integration

```typescript
import { PauseCommitClient } from "@pausesecure/x402-commit";
import { createRiskGuard } from "@pausesecure/x402-risk/client";

const client = new PauseCommitClient({
  network: "ethereum",
  riskGuard: createRiskGuard({ minScore: 40 })
});

// Wrapper for fetch with automatic pause-commit handling
const safeFetch = client.wrapFetch(fetch);

// All x402 requests now use pause-commit with risk screening
const response = await safeFetch("https://api.example.com/premium", {
  headers: { "Authorization": "Bearer token" }
});
```

### Server Integration

```typescript
import { PauseCommitServer } from "@pausesecure/x402-commit/server";

const server = new PauseCommitServer({
  network: "ethereum",
  facilitatorUrl: "https://facilitator.pausesecure.com"
});

app.use("/premium", server.middleware({
  amount: "50000000",
  asset: "0xA0b86a33E6441d45CF1C46cd3e5B4B8FA6a2dF1B",
  payTo: process.env.TREASURY_ADDRESS
}));
```

## Testing and Development

### Testnet Support

Test deployments available on:
- Ethereum Sepolia: `0x...` (coming soon)
- Base Sepolia: `0x...` (coming soon)

### Local Development

```bash
# Install packages
npm install @pausesecure/x402-commit @pausesecure/x402-risk

# Run local test suite
npm test

# Start local facilitator
npm run facilitator:dev
```

## Appendix: Risk Engine Integration

The pause-commit scheme integrates with the PAUSE Risk Engine for automatic address screening. The risk engine evaluates 11 Bayesian signals and provides scores from 0-100:

- **0-20**: Critical risk (blocked automatically)
- **20-40**: High risk (blocked by default, configurable)
- **40-70**: Medium risk (allowed with warnings)
- **70-85**: Low risk (allowed)
- **85-100**: Minimal risk (trusted addresses)

Risk assessment is performed via x402-protected API calls:
- Quick score: `$0.001 USDC`
- Full analysis: `$0.005 USDC`

This creates a self-sustaining security ecosystem where x402 payments fund the security infrastructure that protects x402 payments.