# Custom Client Implementation

This example demonstrates how to implement x402 payment handling **manually** without using the pre-built HTTP client wrapper. It shows the complete payment flow step-by-step, making it an excellent learning resource for understanding how x402 works under the hood.

## What This Example Shows

- **Manual 402 Detection**: Detecting payment required responses
- **Payment Requirement Extraction**: Parsing v1 and v2 payment requirements
- **Payment Creation**: Using the core package to create payments
- **Header Management**: Adding payment headers correctly
- **Request Retry**: Implementing the retry flow manually
- **Version Detection**: Handling both v1 and v2 protocols

## Why Implement a Custom Client?

You should implement a custom client when you need to:

1. **Understand the internals**: Learn how x402 payment flow works
2. **Custom HTTP client**: Integrate with frameworks that have their own HTTP client
3. **Special requirements**: Need custom retry logic, caching, or error handling
4. **Framework integration**: Building adapters for unsupported frameworks
5. **Educational purposes**: Teaching or documenting the protocol

## The Payment Flow

This example implements the complete 6-step payment flow:

### Step 1: Make Initial Request
```go
req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
resp, _ := client.Do(req)
```

### Step 2: Detect 402 Payment Required
```go
if resp.StatusCode != http.StatusPaymentRequired {
    return resp, nil // No payment needed
}
```

### Step 3: Extract Payment Requirements
```go
// Detect protocol version (v1 or v2)
version, _ := detectVersion(headers, body)

// Extract requirements based on version
if version == 2 {
    requirements, resource, extensions, _ := extractV2Requirements(headers, body)
} else {
    requirements, _ := extractV1Requirements(body)
}
```

### Step 4: Create Payment Payload
```go
// Use x402 core package to create payment
if version == 2 {
    payload, _ := x402Client.CreatePaymentPayload(ctx, requirements, resource, extensions)
} else {
    payload, _ := x402Client.CreatePaymentPayloadV1(ctx, requirementsV1)
}

payloadBytes, _ := json.Marshal(payload)
```

### Step 5: Retry with Payment
```go
// Encode payment as base64
encodedPayment := base64.StdEncoding.EncodeToString(payloadBytes)

// Add payment header
retryReq.Header.Set("PAYMENT-SIGNATURE", encodedPayment) // v2
// OR
retryReq.Header.Set("X-PAYMENT", encodedPayment) // v1

// Retry request
retryResp, _ := client.Do(retryReq)
```

### Step 6: Handle Success
```go
// Extract settlement details from response
if paymentHeader := resp.Header.Get("PAYMENT-RESPONSE"); paymentHeader != "" {
    settleResp, _ := extractSettlementResponse(paymentHeader)
}
```

## Prerequisites

- Go 1.21 or higher
- An Ethereum private key (testnet recommended)
- A running x402 server (see [server examples](../../servers/))
- Understanding of [basic HTTP client](../http/)

## Setup

1. **Install dependencies:**

```bash
go mod download
```

2. **Configure environment variables:**

Create a `.env` file:

```bash
# Required
EVM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Optional
SERVER_URL=http://localhost:4021
```

## Running the Example

```bash
go run .
```

Expected output:

```
🔧 Using custom payment implementation (no wrapper)

📤 Step 1: Making initial request...
   URL: http://localhost:4021/weather

💳 Step 2: Payment required (402 response)
🔍 Step 3: Extracting payment requirements...
   Detected protocol version: v2
   Network: eip155:84532
   Scheme: exact
   Amount: {Amount:1000 Asset:0x... Extra:map[...]}

💰 Step 4: Creating payment payload...
   Created payload: 542 bytes

🔄 Step 5: Retrying request with payment...
   Added PAYMENT-SIGNATURE header
   Response status: 200
✅ Step 6: Payment successful!

✅ Response body:
  {
    "city": "San Francisco",
    "weather": "foggy",
    "temperature": 60
  }

💰 Payment Settlement Details:
  Transaction: 0x1234567890abcdef...
  Network: eip155:84532
  Payer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

## Code Structure

### Main Flow (`main.go`)

The example is organized into clear, educational sections:

```go
func makeRequestWithPayment(ctx, x402Client, url) (*http.Response, error) {
    // Step 1: Make initial request
    // Step 2: Check if payment is required
    // Step 3: Extract payment requirements
    // Step 4: Create payment payload
    // Step 5: Retry request with payment
    // Step 6: Verify success
}
```

### Helper Functions

**Version Detection:**
```go
func detectVersion(headers, body) (int, error)
```
- Detects whether server uses v1 or v2 protocol
- Checks for `PAYMENT-REQUIRED` header (v2)
- Falls back to body `x402Version` field (v1)

**V2 Requirements Extraction:**
```go
func extractV2Requirements(headers, body) (PaymentRequirements, *ResourceInfo, map[string]interface{}, error)
```
- Decodes base64 `PAYMENT-REQUIRED` header
- Parses payment requirements
- Returns first acceptable requirement

**V1 Requirements Extraction:**
```go
func extractV1Requirements(body) (PaymentRequirements, error)
```
- Parses V1 payment required from body
- Converts to common requirements format

**Settlement Extraction:**
```go
func extractSettlementResponse(headerValue) (SettleResponse, error)
```
- Decodes `PAYMENT-RESPONSE` header
- Extracts transaction details

## Protocol Differences: V1 vs V2

### V1 Protocol

**Payment Required (Response):**
```json
// Body:
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "address": "0x...",
    "amount": { "amount": "1000", "asset": "0x..." }
  }]
}
```

**Payment Signature (Request):**
```
Header: X-PAYMENT
Value: base64(payloadJSON)
```

### V2 Protocol

**Payment Required (Response):**
```
Header: PAYMENT-REQUIRED
Value: base64({
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "payTo": "0x...",
    "amount": { "amount": "1000", "asset": "0x..." }
  }],
  "resource": {...},
  "extensions": {...}
})
```

**Payment Signature (Request):**
```
Header: PAYMENT-SIGNATURE
Value: base64(payloadJSON)
```

## Comparison: Wrapper vs Custom

| Aspect | HTTP Wrapper | Custom Implementation |
|--------|-------------|----------------------|
| Code Lines | ~5 lines | ~250 lines |
| Complexity | Very simple | Educational/detailed |
| Flexibility | Limited | Complete control |
| Understanding | Black box | Step-by-step visible |
| Maintenance | x402 team | You maintain |
| Use Case | Production use | Learning/custom needs |

## When to Use Custom vs Wrapper

### Use the Wrapper When:
- ✅ Building standard applications
- ✅ Want simple, maintainable code
- ✅ Trust the x402 implementation
- ✅ Need quick integration

### Use Custom Implementation When:
- ✅ Learning how x402 works
- ✅ Integrating with custom frameworks
- ✅ Need special error handling
- ✅ Building adapters for other languages
- ✅ Debugging protocol issues
- ✅ Teaching/documentation

## Adapting to Other Frameworks

This example can be adapted to other HTTP frameworks:

### For Resty
```go
resp, err := resty.New().R().Get(url)
if resp.StatusCode() == 402 {
    // Extract requirements
    // Create payment
    // Retry with SetHeader()
}
```

### For Fiber Client
```go
agent := fiber.Get(url)
resp := agent.Send()
if resp.StatusCode() == 402 {
    // Extract requirements
    // Create payment
    // Retry with agent.Set()
}
```

### For gRPC Metadata
```go
md := metadata.New(map[string]string{
    "payment-signature": encodedPayment,
})
ctx := metadata.NewOutgoingContext(ctx, md)
// Make gRPC call with ctx
```

## Error Handling

The example demonstrates proper error handling at each step:

```go
// Version detection error
if version == 0 {
    return fmt.Errorf("could not detect x402 version")
}

// Payment creation error
if err := x402Client.CreatePaymentPayload(...); err != nil {
    return fmt.Errorf("failed to create payment: %w", err)
}

// Payment failure
if retryResp.StatusCode >= 400 {
    return fmt.Errorf("payment failed: status %d", retryResp.StatusCode)
}
```

## Testing Against Local Server

1. Start server:
```bash
cd ../../servers/gin
go run main.go
```

2. Run custom client:
```bash
cd ../../clients/custom
go run .
```

## Next Steps

- **[Basic HTTP Client](../http/)**: See the simple wrapper approach
- **[Advanced Examples](../advanced/)**: Production patterns
- **[Core Package Docs](../../../../go/)**: Deep dive into x402 core

## Related Resources

- [x402 Protocol Specification](../../../../specs/)
- [HTTP Client Package](../../../../go/http/)
- [Payment Types](../../../../go/types/)

