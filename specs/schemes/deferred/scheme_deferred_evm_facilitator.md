# Deferred Facilitator Specification

## Summary

This specification defines the custom REST API endpoints that facilitators must implement to support the `deferred` payment scheme. These endpoints complement the standard x402 `/verify` and `/settle` endpoints.

All endpoints are served under the facilitator's deferred scheme namespace: `${FACILITATOR_URL}/deferred/`

## Authentication

Read-only endpoints do not require authentication. Information retrieved by these endpoints is either publicly available on-chain or will be eventually.
Write endpoints rely on verification of signed messages rather than traditional authentication. See each endpoint for details.

## Endpoints

### GET /buyers/:buyer

Retrieves on-chain account data for a specific buyer, including escrow balance, asset allowance, and permit nonce. If the facilitator supports the `deferred-voucher-store` extension, also returns the latest voucher for the buyer-seller-asset tuple.

**Query Parameters:**
- `seller` (required): Seller address
- `asset` (required): Asset (token) address
- `escrow` (required): Escrow contract address
- `chainId` (required): Chain ID

**Example Request:**
```
GET /deferred/buyers/0x209693Bc6afc0C5328bA36FaF03C514EF312287C?seller=0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D&asset=0x036CbD53842c5426634e7929541eC2318f3dCF7e&escrow=0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27&chainId=84532
```

**Response (200 OK):**
```json
{
  "balance": "10000000",
  "assetAllowance": "5000000",
  "assetPermitNonce": "0"
}
```

**Response (200 OK - with voucher, when facilitator supports `deferred-voucher-store` extension):**
```json
{
  "balance": "10000000",
  "assetAllowance": "5000000",
  "assetPermitNonce": "0",
  "voucher": {
    "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
    "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "valueAggregate": "5000000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "timestamp": 1740673000,
    "nonce": 2,
    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
    "chainId": 84532
  },
  "signature": "0x3a2f7e3b..."
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid parameters"
}
```

### POST /buyers/:buyer/flush

Executes gasless fund recovery for a buyer using a signed flush authorization. This operation:
1. Withdraws any funds that have completed their thawing period
2. Initiates thawing for any remaining balance

**Path Parameters:**
- `buyer` (required): Buyer address

**Request Body (Specific Flush):**
```json
{
  "authorization": {
    "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "expiry": 1740759400
  },
  "signature": "0xbfdc3d0a...",
  "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
  "chainId": 84532
}
```

**Request Body (Flush All):**
```json
{
  "authorization": {
    "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "expiry": 1740759400
  },
  "signature": "0xbfdc3d0a...",
  "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
  "chainId": 84532
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "transaction": "0xabc123...",
  "network": "eip155:84532"
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "errorReason": "reason",
  "transaction": "",
  "network": "eip155:84532"
}
```


### POST /vouchers/collect

Submits vouchers for on-chain settlement by calling the escrow contract's `collect` function. Accepts an array of vouchers to enable batch collection.

**Request Body:**
```json
{
  "vouchers": [
    {
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "valueAggregate": "5000000",
        "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "timestamp": 1740673000,
        "nonce": 2,
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "chainId": 84532
      },
      "signature": "0x3a2f7e3b..."
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "transaction": "0xabc123...",
  "network": "eip155:84532",
  "payer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "errorReason": "<reason>",
  "transaction": "",
  "network": "eip155:84532",
  "payer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
}
```
