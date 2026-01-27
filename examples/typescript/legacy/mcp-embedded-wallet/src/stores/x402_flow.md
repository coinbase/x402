# X402 Payment Protocol Flow & Types Guide

This guide explains the complete x402 request/response flow and type definitions for building an MCP (Model Context Protocol) server that interfaces with resource servers and handles x402 payments.

## Overview

The x402 protocol enables HTTP resources to require payment using the existing `402 Payment Required` status code. It's a two-phase protocol: **Discovery/Challenge** and **Payment/Settlement**.

## Complete Request/Response Flow

### Phase 1: Discovery & Payment Challenge

#### 1.1 Initial Request (No Payment)
```http
GET /protected-resource HTTP/1.1
Host: api.example.com
```

#### 1.2 Server Response (402 Payment Required)
```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia", 
      "maxAmountRequired": "1000000",  // 1 USDC in atomic units (6 decimals)
      "resource": "/protected-resource",
      "description": "Access to premium API endpoint",
      "mimeType": "application/json",
      "payTo": "0x742d35Cc64C3E3b24a3A4c1537e2b68b5e04e7A2",
      "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC contract
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ]
}
```

### Phase 2: Payment & Settlement

#### 2.1 Payment Request with X-PAYMENT Header
```http
GET /protected-resource HTTP/1.1
Host: api.example.com
X-PAYMENT: eyJ4NDAyVmVyc2lvbiI6MSwic2NoZW1lIjoiZXhhY3QiLCJuZXR3b3JrIjoiYmFzZS1zZXBvbGlhIiwicGF5bG9hZCI6eyJzaWduYXR1cmUiOiIweDJkNmE3NTg4ZDZhY2NhNTA1Y2JmMGQ5YTRhMjI3ZTBjNTJjNmMzNDAwOGM4ZTg5ODZhMTI4MzI1OTc2NDE3MzYwOGEyY2U2NDk2NjQyZTM3N2Q2ZGE4ZGJiZjU4MzZlOWJkMTUwOTJmOWVjYWIwNWRlZDNkNjI5M2FmMTQ4YjU3MWMiLCJhdXRob3JpemF0aW9uIjp7ImZyb20iOiIweDg1N2IwNjUxOUU5MWUzQTU0NTM4NzkxYkRiYjBFMjIzNzNlMzZiNjYiLCJ0byI6IjB4MjA5NjkzQmM2YWZjMEM1MzI4YkEzNkZhRjAzQzUxNEVGMzEyMjg3QyIsInZhbHVlIjoiMTAwMDAiLCJ2YWxpZEFmdGVyIjoiMTc0MDY3MjA4OSIsInZhbGlkQmVmb3JlIjoiMTc0MDY3MjE1NCIsIm5vbmNlIjoiMHhmMzc0NjYxM2MyZDkyMGI1ZmRhYmMwODU2ZjJhZWIyZDRmODhlZTYwMzdiOGNjNWQwNGE3MWE0NDYyZjEzNDgwIn19fQ==
Access-Control-Expose-Headers: X-PAYMENT-RESPONSE
```

#### 2.2 Server Success Response with Settlement
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJ0cmFuc2FjdGlvbiI6IjB4YWJjZGVmMTIzNDU2Nzg5MCIsIm5ldHdvcmsiOiJiYXNlLXNlcG9saWEiLCJwYXllciI6IjB4ODU3YjA2NTE5RTkxZTNBNTQ1Mzg3OTFiRGJiMEUyMjM3M2UzNmI2NiJ9

{
  "message": "Protected endpoint accessed successfully",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": { ... }
}
```

## Key Type Definitions

### Core Types

```typescript
// Main payment requirements structure
interface PaymentRequirements {
  scheme: "exact";                    // Payment scheme
  network: Network;                   // Blockchain network
  maxAmountRequired: string;          // Amount in atomic units
  resource: string;                   // URL path being paid for
  description: string;                // Human-readable description
  mimeType: string;                   // Expected response MIME type  
  payTo: string;                      // Recipient address
  maxTimeoutSeconds: number;          // Payment validity window
  asset: string;                      // Token contract address
  outputSchema?: Record<string, any>; // Optional response schema
  extra?: Record<string, any>;        // Scheme-specific data (EIP-712 domain)
}

// 402 Payment Required Response
interface PaymentRequiredResponse {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
}

// Payment payload in X-PAYMENT header (base64 encoded)
interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: Network;
  payload: ExactEvmPayload;
}

// EVM "exact" scheme payload
interface ExactEvmPayload {
  signature: string;              // EIP-3009 signature
  authorization: {
    from: string;                 // Payer address
    to: string;                   // Recipient address  
    value: string;                // Amount in atomic units
    validAfter: string;           // Unix timestamp
    validBefore: string;          // Unix timestamp
    nonce: string;                // Unique nonce
  };
}

// Settlement response in X-PAYMENT-RESPONSE header (base64 encoded)
interface SettlementResponse {
  success: boolean;
  transaction: string;            // Transaction hash
  network: Network;
  payer: string;                  // Payer address
}
```

### Network Types

```typescript
type Network = 
  | "base"           // Base mainnet
  | "base-sepolia"   // Base testnet
  | "avalanche" 
  | "avalanche-fuji"
  | "iotex"
  | "iotex-testnet";

// Chain ID mappings
const ChainIdToNetwork: Record<number, Network> = {
  8453: "base",
  84532: "base-sepolia", 
  43114: "avalanche",
  43113: "avalanche-fuji",
  4689: "iotex",
  // ...
};
```

### Amount Handling

```typescript
// maxAmountRequired is ALWAYS in atomic units of the specified asset
// - USDC: 6 decimals, so $1.00 = "1000000"
// - ETH: 18 decimals, so 1 ETH = "1000000000000000000" 
// - Other tokens: varies by token.decimals

// Example price conversion
function usdToAtomicAmount(usd: number, decimals: number): string {
  return (usd * 10 ** decimals).toString();
}

// $0.10 USDC = "100000" (0.10 * 10^6)
// $1.00 USDC = "1000000" (1.00 * 10^6)
```

## MCP Implementation Requirements

For your MCP server to interface with x402 resource servers, you'll need to implement:

### 1. Client-Side Payment Handling

```typescript
class X402MCPClient {
  async makeRequest(url: string, options?: RequestInit): Promise<Response> {
    // 1. Make initial request
    const response = await fetch(url, options);
    
    // 2. Handle 402 Payment Required
    if (response.status === 402) {
      const paymentData = await response.json() as PaymentRequiredResponse;
      
      // 3. Select payment requirements
      const selectedRequirement = this.selectPaymentRequirement(paymentData.accepts);
      
      // 4. Create payment header
      const paymentHeader = await this.createPaymentHeader(
        paymentData.x402Version,
        selectedRequirement
      );
      
      // 5. Retry with payment
      return fetch(url, {
        ...options,
        headers: {
          ...options?.headers,
          'X-PAYMENT': paymentHeader,
          'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE'
        }
      });
    }
    
    return response;
  }
  
  private selectPaymentRequirement(accepts: PaymentRequirements[]): PaymentRequirements {
    // Priority: USDC -> Base network -> lowest amount
    return accepts
      .filter(req => req.asset.includes('USDC') || req.network === 'base')
      .sort((a, b) => parseInt(a.maxAmountRequired) - parseInt(b.maxAmountRequired))[0];
  }
  
  private async createPaymentHeader(version: number, requirements: PaymentRequirements): Promise<string> {
    // Create EIP-3009 authorization and signature
    const authorization = {
      from: this.walletAddress,
      to: requirements.payTo,
      value: requirements.maxAmountRequired,
      validAfter: Math.floor(Date.now() / 1000).toString(),
      validBefore: Math.floor((Date.now() + 60000) / 1000).toString(), // 1 min validity
      nonce: this.generateNonce()
    };
    
    const signature = await this.signAuthorization(authorization, requirements.extra);
    
    const payload: PaymentPayload = {
      x402Version: version,
      scheme: "exact",
      network: requirements.network,
      payload: { signature, authorization }
    };
    
    return btoa(JSON.stringify(payload));
  }
}
```

### 2. Server-Side Payment Verification (if hosting resources)

```typescript
class X402MCPServer {
  async handleRequest(request: Request): Promise<Response> {
    const paymentHeader = request.headers.get('X-PAYMENT');
    
    if (!paymentHeader) {
      return this.create402Response();
    }
    
    // Decode and verify payment
    const payment = this.decodePaymentHeader(paymentHeader);
    const verification = await this.verifyPayment(payment);
    
    if (!verification.isValid) {
      return this.create402Response(verification.invalidReason);
    }
    
    // Process request
    const response = await this.processRequest(request);
    
    // Settle payment and add response header
    const settlement = await this.settlePayment(payment);
    if (settlement.success) {
      response.headers.set('X-PAYMENT-RESPONSE', btoa(JSON.stringify(settlement)));
      response.headers.set('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');
    }
    
    return response;
  }
  
  private create402Response(error = "X-PAYMENT header is required"): Response {
    const paymentRequired: PaymentRequiredResponse = {
      x402Version: 1,
      error,
      accepts: [{
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "100000", // $0.10 USDC
        resource: "/protected-resource",
        description: "Access to MCP resource",
        mimeType: "application/json",
        payTo: this.recipientAddress,
        maxTimeoutSeconds: 60,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
        extra: { name: "USDC", version: "2" }
      }]
    };
    
    return new Response(JSON.stringify(paymentRequired), {
      status: 402,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

### 3. Facilitator Integration

You'll also need to integrate with a facilitator service for verification and settlement:

```typescript
class FacilitatorClient {
  async verify(payment: PaymentPayload, requirements: PaymentRequirements): Promise<VerificationResponse> {
    const response = await fetch(`${this.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentPayload: payment, paymentRequirements: requirements })
    });
    return response.json();
  }
  
  async settle(payment: PaymentPayload, requirements: PaymentRequirements): Promise<SettlementResponse> {
    const response = await fetch(`${this.facilitatorUrl}/settle`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentPayload: payment, paymentRequirements: requirements })
    });
    return response.json();
  }
}
```

### 4. Error Handling

Key error scenarios to handle:

```typescript
const ErrorReasons = [
  "insufficient_funds",
  "invalid_exact_evm_payload_authorization_valid_after",
  "invalid_exact_evm_payload_authorization_valid_before", 
  "invalid_exact_evm_payload_authorization_value",
  "invalid_exact_evm_payload_signature",
  "invalid_exact_evm_payload_recipient_mismatch",
  "invalid_network",
  "invalid_payload",
  "invalid_payment_requirements",
  "invalid_scheme",
  "unsupported_scheme",
  "invalid_x402_version",
  "invalid_transaction_state",
  "unexpected_verify_error",
  "unexpected_settle_error"
] as const;
```

## Summary

The x402 protocol provides a standardized way to monetize HTTP resources using blockchain payments. Your MCP server needs to:

1. **Handle 402 responses** by parsing payment requirements
2. **Create payment headers** using EIP-3009 signatures  
3. **Retry requests** with X-PAYMENT headers
4. **Process settlement responses** from X-PAYMENT-RESPONSE headers
5. **Integrate with facilitators** for verification and settlement

The protocol is designed to be gasless for both clients and servers, with facilitators handling the on-chain transactions.