# Upto EVM Scheme (Go)

The **upto** scheme enables usage-based billing on EVM networks. The client authorizes a **maximum** payment amount, but the server settles **only what was actually used**. This is ideal for variable-cost endpoints like LLM token generation, compute time, or bandwidth metering.

Permit2 is the default asset transfer method. Services can explicitly select **EIP-3009**, which signs `ReceiveWithAuthorization` to the canonical `x402UptoERC3009Proxy`. Both proxies accept the actual `amount` at settlement time, so the facilitator can settle any amount up to the authorized maximum.

## Import Paths

| Role | Import |
|------|--------|
| Client | `github.com/x402-foundation/x402/go/v2/mechanisms/evm/upto/client` |
| Server | `github.com/x402-foundation/x402/go/v2/mechanisms/evm/upto/server` |
| Facilitator | `github.com/x402-foundation/x402/go/v2/mechanisms/evm/upto/facilitator` |

## Client Usage

Register `UptoEvmScheme` with an `x402Client` to handle payments for services that use the `upto` scheme. From the buyer's perspective, usage is transparent — the SDK signs a max-authorization and the server charges only what was consumed.

```go
import (
    x402 "github.com/x402-foundation/x402/go/v2"
    exactevm "github.com/x402-foundation/x402/go/v2/mechanisms/evm/exact/client"
    uptoevm "github.com/x402-foundation/x402/go/v2/mechanisms/evm/upto/client"
    evmsigners "github.com/x402-foundation/x402/go/v2/signers/evm"
)

evmSigner, err := evmsigners.NewClientSignerFromPrivateKey(os.Getenv("EVM_PRIVATE_KEY"))

x402Client := x402.Newx402Client().
    Register("eip155:*", exactevm.NewExactEvmScheme(evmSigner, nil)). // fixed-price services
    Register("eip155:*", uptoevm.NewUptoEvmScheme(evmSigner, nil))    // usage-based services
```

### Asset Transfer Methods

- **Permit2 (default):** Requires `PaymentRequirements.Extra["facilitatorAddress"]`. The address is embedded in the Permit2 witness.
- **EIP-3009 (explicit):** Set `extra.assetTransferMethod` to `"eip3009"`. This flow requires token `name` and `version`, plus `extra.settlerAddress`. It signs `ReceiveWithAuthorization` to `0x40203Fa50150e6ec970DE91F3330e82cDF640006`.

The facilitator advertises one selected signer under both `facilitatorAddress` and `settlerAddress`; the server copies only the key needed by the selected transfer method.

To select EIP-3009 explicitly, use an asset amount with token domain metadata:

```go
Price: map[string]interface{}{
    "amount": "100000",
    "asset":  "0xYourEIP3009Token",
    "extra": map[string]interface{}{
        "assetTransferMethod": "eip3009",
        "name":                "USDC",
        "version":             "2",
    },
},
```

## Server Usage

Register `UptoEvmScheme` with middleware and use `SetSettlementOverrides` in your handler to specify the actual charge.

```go
import (
    x402 "github.com/x402-foundation/x402/go/v2"
    x402http "github.com/x402-foundation/x402/go/v2/http"
    ginmw "github.com/x402-foundation/x402/go/v2/http/gin"
    uptoevm "github.com/x402-foundation/x402/go/v2/mechanisms/evm/upto/server"
)

r.Use(ginmw.X402Payment(ginmw.Config{
    Routes: x402http.RoutesConfig{
        "GET /api/generate": {
            Accepts: x402http.PaymentOptions{
                {
                    Scheme:  "upto",
                    Price:   "$0.10",           // client authorizes up to 10 cents
                    Network: "eip155:84532",
                    PayTo:   "0xYourAddress",
                },
            },
            Description: "AI text generation - billed by token usage",
        },
    },
    Facilitator: facilitatorClient,
    Schemes: []ginmw.SchemeConfig{
        {Network: x402.Network("eip155:84532"), Server: uptoevm.NewUptoEvmScheme()},
    },
}))

// In your handler, settle the actual usage:
r.GET("/api/generate", func(c *gin.Context) {
    actualUsage := computeActualCost() // your billing logic
    ginmw.SetSettlementOverrides(c, &x402.SettlementOverrides{
        Amount: fmt.Sprintf("%d", actualUsage),
    })
    c.JSON(http.StatusOK, gin.H{"result": "..."})
})
```

### Settlement Override Formats

The `Amount` in `SettlementOverrides` supports three formats:

| Format | Example | Description |
|--------|---------|-------------|
| Raw atomic units | `"50000"` | Settles exactly 50,000 atomic units |
| Percentage | `"50%"` | Settles 50% of the authorized maximum |
| Dollar price | `"$0.05"` | Converts to atomic units (when route used `$` pricing) |

Setting `Amount` to `"0"` skips on-chain settlement entirely — the client is not charged.

## Facilitator Usage

For custom facilitator implementations:

```go
import (
    uptoevm "github.com/x402-foundation/x402/go/v2/mechanisms/evm/upto/facilitator"
)

scheme := uptoevm.NewUptoEvmScheme(evmSigner, nil)
```

The upto facilitator's `GetExtra()` returns both a `facilitatorAddress` and `settlerAddress` with the same signer address. Only that signer can call the selected upto proxy's `settle()` function.

## Supported Networks

Works on EIP-155 compatible networks where the proxy for the selected transfer method is deployed:

| Network | CAIP-2 ID |
|---------|-----------|
| Base Mainnet | `eip155:8453` |
| Base Sepolia | `eip155:84532` |

## How It Works

1. Server advertises `scheme: "upto"` with a max `price`
2. Client signs either a Permit2 authorization or an EIP-3009 `ReceiveWithAuthorization` for the maximum
3. Server performs work, calculates actual cost
4. Server calls `SetSettlementOverrides` with the actual amount
5. Facilitator settles on-chain for the actual amount (≤ max)
6. If actual amount is `0`, no on-chain transaction occurs

## Gas Sponsoring Extensions

The gas sponsoring extensions apply only to the Permit2 flow. They let the **facilitator** pay for the client's Permit2 approval transaction, removing all gas costs from the client. Explicit EIP-3009 payloads do not attach Permit2 approval extensions.

### EIP-2612 Gas Sponsoring

The preferred path. If the payment token supports [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612), the client signs an off-chain permit and the facilitator bundles approval + settlement in a single `settleWithPermit` call — zero gas for the client.

**Server:** Declare the extension in your route config:

```go
import (
    "github.com/x402-foundation/x402/go/v2/extensions/eip2612gassponsor"
)

routes := x402http.RoutesConfig{
    "GET /api/generate": {
        Accepts: x402http.PaymentOptions{
            {
                Scheme:  "upto",
                Price:   "$0.10",
                Network: "eip155:84532",
                PayTo:   "0xYourAddress",
            },
        },
        Extensions: eip2612gassponsor.DeclareEip2612GasSponsoringExtension(),
    },
}
```

**Client:** No additional setup. `UptoEvmScheme` automatically checks for the extension and signs the permit when applicable.

**Facilitator:** Register the extension:

```go
import (
    "github.com/x402-foundation/x402/go/v2/extensions/eip2612gassponsor"
)

facilitator.RegisterExtension(eip2612gassponsor.EIP2612GasSponsoring)
```

### ERC-20 Approval Gas Sponsoring

Fallback for tokens that do not support EIP-2612. The client signs a raw `approve(Permit2, MaxUint256)` transaction off-chain; the facilitator broadcasts it before settling.

**Server:** Declare the extension (omit `name`/`version` from token config to signal non-EIP-2612 tokens):

```go
import (
    "github.com/x402-foundation/x402/go/v2/extensions/erc20approvalgassponsor"
)

routes := x402http.RoutesConfig{
    "GET /api/generate": {
        Accepts: x402http.PaymentOptions{ /* ... */ },
        Extensions: erc20approvalgassponsor.DeclareExtension(),
    },
}
```

**Client:** The signer must support transaction signing (nonce resolution, fee estimation). `UptoEvmScheme` falls back to this when EIP-2612 is unavailable.

**Facilitator:** Register with a signer that can broadcast transactions:

```go
import (
    "github.com/x402-foundation/x402/go/v2/extensions/erc20approvalgassponsor"
)

erc20Ext := &erc20approvalgassponsor.Erc20ApprovalFacilitatorExtension{Signer: evmSigner}
facilitator.RegisterExtension(erc20Ext)
```

### Extension Priority

When both extensions are advertised, EIP-2612 takes priority. The client tries EIP-2612 first; if the token lacks `name`/`version` in `Extra`, it falls back to ERC-20 approval gas sponsoring.

## Examples

- [Gin upto server](https://github.com/x402-foundation/x402/tree/main/examples/go/servers/upto)

## See Also

- [Exact EVM Scheme](../exact/README.md) — fixed-price payments
- [x402 Docs: Payment Schemes](https://docs.x402.org/getting-started/quickstart-for-sellers#payment-schemes-exact-vs-upto)
- [x402 Docs: Quickstart for Sellers](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [x402 Docs: Quickstart for Buyers](https://docs.x402.org/getting-started/quickstart-for-buyers)
