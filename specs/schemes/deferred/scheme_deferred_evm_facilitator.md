# Deferred Facilitator Specification

## Summary

This specification defines the REST API endpoints that facilitators must implement to support the `deferred` payment scheme. These endpoints enable sellers to store, retrieve, and settle vouchers through the facilitator's voucher store infrastructure. Vouchers are identified by a unique combination of `id` (64-character hex string) and `nonce` (non-negative integer).

All endpoints are served under the facilitator's deferred scheme namespace: `${FACILITATOR_URL}/deferred/`

## Authentication

Read only endpoints do not require any form of authentication. Any information that can be retrieved by these endpoints will eventually be publicly available on chain.
As for write endpoints, they do not require traditional authentication but instead they rely on verification of signed messages. See each endpoint for details.

## Required APIs

### GET /buyers/:buyer

Retrieves buyer data for a specific buyer, including escrow account balance, asset allowance, permit nonce, and the latest available voucher for a particular seller and asset.

**Query Parameters:**
- `seller` (required): Seller address (e.g., "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D")
- `asset` (required): Asset address (e.g., "0x081827b8c3aa05287b5aa2bc3051fbe638f33152")
- `escrow` (required): Escrow address (e.g., "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27")
- `chainId` (required): Chain ID (e.g., 84532)

**Example Request:**
```
GET /buyers/0x209693Bc6afc0C5328bA36FaF03C514EF312287C?seller=0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D&asset=0x081827b8c3aa05287b5aa2bc3051fbe638f33152&escrow=0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27&chainId=84532
```

**Response (200 OK):**
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
    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
    "timestamp": 1740673000,
    "nonce": 2,
    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
    "chainId": 84532
    "signature": "0x3a2f7e3b..."
  }
}
```

**Response (200 OK - No voucher available):**
```json
{
  "balance": "10000000",
  "assetAllowance": "5000000",
  "assetPermitNonce": "0"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid parameters"
}
```

### POST /vouchers

Stores a new signed voucher in the facilitator's voucher store after verifying it. The verification should be exactly the same as you'd get by POSTing to /verify. This allows for replacing that call for one to this endpoint.

If the payment payload contains a `depositAuthorization`, the facilitator must execute it **before** storing the voucher:
1. If a `permit` is present, call the token contract's `permit` function
2. Call the escrow contract's `depositWithAuthorization` function
3. Verify the deposit succeeded by checking the escrow balance
4. Only then store the voucher

**Request Body (without depositAuthorization):**
```json
{
  "paymentPayload": {
    "x402Version": 1,
    "network": "base-sepolia",
    "scheme": "deferred",
    "payload": {
      "signature": "0x4b3f8e...",
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "valueAggregate": "6000000",
        "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
        "timestamp": 1740673100,
        "nonce": 3,
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "chainId": 84532
      }
    }
  },
  "paymentRequirements": {
    "x402Version": 1,
    "network": "base-sepolia",
    "scheme": "deferred",
    "recipient": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "amount": "1000000",
    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
    "extra": {
      "type": "aggregation",
      "signature": "0x3a2f7e3b...",
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "valueAggregate": "5000000",
        "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
        "timestamp": 1740673000,
        "nonce": 2,
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "chainId": 84532
      }
    }
  }
}
```

**Request Body (with depositAuthorization):**
```json
{
  "paymentPayload": {
    "x402Version": 1,
    "network": "base-sepolia",
    "scheme": "deferred",
    "payload": {
      "signature": "0x4b3f8e...",
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "valueAggregate": "1000000",
        "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
        "timestamp": 1740673000,
        "nonce": 1,
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "chainId": 84532
      },
      "depositAuthorization": {
        "permit": {
          "owner": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
          "spender": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
          "value": "5000000",
          "nonce": "0",
          "deadline": 1740759400,
          "domain": {
            "name": "USD Coin",
            "version": "2"
          },
          "signature": "0x8f9e2a3b..."
        },
        "depositAuthorization": {
          "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
          "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
          "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
          "amount": "5000000",
          "nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          "expiry": 1740759400,
          "signature": "0xbfdc3d0a..."
        }
      }
    }
  },
  "paymentRequirements": {
    "x402Version": 1,
    "network": "base-sepolia",
    "scheme": "deferred",
    "recipient": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "amount": "1000000",
    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
    "extra": {
      "type": "new",
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27"
      }
    }
  }
}
```

**Response (201 Created):**
```json
{
  "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
  "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
  "valueAggregate": "6000000",
  "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
  "timestamp": 1740673100,
  "nonce": 3,
  "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
  "chainId": 84532
  "signature": "0x4b3f8e..."
}
```

**Response (400 Bad Request):**
```json
{
  "isValid": false,
  "invalidReason": "invalid_deferred_evm_payload_signature",
  "payer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
}
```

### POST /vouchers/:id/:nonce/settle

Initiates on-chain settlement of a voucher by calling the escrow contract's `collect` function.

**Request Body (optional):**
```json
{
  "gasPrice": "20000000000",
  "gasLimit": "150000"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "transactionHash": "0xabc123...",
  "collectedAmount": "6000000",
  "network": "base-sepolia"
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "Voucher not found"
}
```

## Optional APIs

These endpoints are not required for the x402 deferred handshake between a buyer and a seller but might come in handy for audit, visualization or observability purposes.

### GET /vouchers/:id/:nonce

Retrieves a specific voucher by ID and nonce.

**Response (200 OK):**
```json
{
  "voucher": { /* voucher fields */ },
  "signature": "0x3a2f7e3b..."
}
```

### GET /vouchers/:id

Retrieves all vouchers in a series, sorted by nonce (descending).

**Query Parameters:**
- `limit` (optional): Maximum results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response (200 OK):**
```json
{
  "vouchers": [
    {
      "voucher": { /* voucher fields */ },
      "signature": "0x4b3f8e..."
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 5
  }
}
```

### GET /vouchers

Queries vouchers with filtering.

**Query Parameters:**
- `buyer` (optional): Filter by buyer address
- `seller` (optional): Filter by seller address
- `latest` (optional): If true, return only highest nonce per series
- `limit` (optional): Maximum results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response (200 OK):**
```json
{
  "vouchers": [
    {
      "voucher": { /* voucher fields */ },
      "signature": "0x3a2f7e3b..."
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 42
  }
}
```

### POST /vouchers/:id/:nonce/verify

Verifies a voucher's validity without settling it.

**Response (200 OK):**
```json
{
  "valid": true,
  "escrowBalance": "10000000",
  "collectableAmount": "6000000",
  "alreadyCollected": "0"
}
```

### GET /vouchers/:id/:nonce/collections

Retrieves settlement history for a voucher.

**Query Parameters:**
- `limit` (optional): Maximum results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response (200 OK):**
```json
{
  "collections": [
    {
      "voucherId": "0x9f8d3e4a...",
      "voucherNonce": 3,
      "transactionHash": "0xabc123...",
      "collectedAmount": "6000000",
      "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
      "chainId": 84532,
      "collectedAt": 1740673200
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 1
  }
}
```


### GET /vouchers/available/:buyer/:seller

Returns the most suitable voucher for aggregation between a buyer-seller pair.

**Response (200 OK):**
```json
{
  "voucher": {
    "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
    "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "valueAggregate": "5000000",
    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
    "timestamp": 1740673000,
    "nonce": 2,
    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
    "chainId": 84532
  },
  "signature": "0x3a2f7e3b..."
}
```

**Response (404 Not Found):** No vouchers exist for this pair

### POST /buyers/:buyer/flush

Flushes an escrow account using a signed flush authorization. This operation allows a buyer to authorize the facilitator to help them recover escrowed funds by:
1. Withdrawing any funds that have completed their thawing period
2. Initiating thawing for any remaining balance

The flush authorization can be either:
- **Specific flush**: When `seller` and `asset` are provided, flushes only that specific account
- **Flush all**: When `seller` or `asset` are undefined, flushes all escrow accounts for the buyer

**Request Body:**
```json
{
  "flushAuthorization": {
    "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "asset": "0x081827b8c3aa05287b5aa2bc3051fbe638f33152",
    "nonce": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "expiry": 1740759400,
    "signature": "0xbfdc3d0a..."
  },
  "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
  "chainId": 84532
}
```

**Request Body (Flush All - seller/asset undefined):**
```json
{
  "flushAuthorization": {
    "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "nonce": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "expiry": 1740759400,
    "signature": "0xbfdc3d0a..."
  },
  "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
  "chainId": 84532
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "transaction": "0xabc123...",
  "payer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "errorReason": "invalid_deferred_evm_payload_flush_authorization_signature",
  "transaction": "",
  "payer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C"
}
```

