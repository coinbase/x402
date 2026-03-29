# Extension: `deferred-voucher-store`

## Summary

The `deferred-voucher-store` extension enables facilitators to store vouchers on behalf of resource servers. This simplifies server implementation by removing the need for voucher storage infrastructure while allowing servers to retain full control over when to initiate on-chain collection.

This extension is only applicable to the `deferred` payment scheme.

---

## Facilitator Advertisement

Facilitators advertise this capability in their `/supported` response:

```json
{
  "kinds": [
    { "scheme": "deferred", "network": "eip155:84532" }
  ],
  "extensions": ["deferred-voucher-store"]
}
```

---

## Voucher Management

Servers opt into facilitator-managed voucher storage by setting `voucherStorage: facilitator` in `PaymentRequirements.extra`. Servers should check that the facilitator supports this extension before configuring it.

```json
{
  "extra": {
    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
    "name": "USDC",
    "version": "2",
    "voucherStorage": "facilitator"
  }
}
```

The extension modifies behavior for some of the standard endpoints and adds additional ones to facilitate voucher management.

### Modified Endpoint Behavior

When this extension is active, the following standard endpoints behave differently:

#### GET /deferred/buyers/:buyer

Returns stored voucher data in addition to on-chain account data:

**Response (with stored voucher):**
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

Without this extension, `voucher` and `signature` fields would be absent from the response.

#### POST /settle

When `PaymentRequirements.extra.voucherStorage === "facilitator"`, the facilitator stores the voucher as part of settlement.

### Additional Endpoints

The extension provides endpoints for servers to query and retrieve stored vouchers.

#### GET /deferred/vouchers

Query vouchers with filters.

**Query Parameters:**
- `buyer` (optional): Filter by buyer address
- `seller` (optional): Filter by seller address
- `asset` (optional): Filter by asset address
- `chainId` (optional): Filter by chain ID
- `escrow` (optional): Filter by escrow contract address

**Example Request:**
```
GET /deferred/vouchers?seller=0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D&chainId=84532
```

**Response (200 OK):**
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
        "nonce": 5,
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "chainId": 84532
      },
      "signature": "0x3a2f7e3b..."
    }
  ]
}
```

#### GET /deferred/vouchers/:id

Get all vouchers in a series by voucher ID.

**Path Parameters:**
- `id`: Voucher ID (bytes32)

**Query Parameters:**
- `chainId` (required): Chain ID
- `escrow` (required): Escrow contract address

**Example Request:**
```
GET /deferred/vouchers/0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc?chainId=84532&escrow=0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27
```

**Response (200 OK):**
```json
{
  "vouchers": [
    {
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "valueAggregate": "1000000",
        "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "timestamp": 1740670000,
        "nonce": 1,
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "chainId": 84532
      },
      "signature": "0x1a2b3c4d..."
    },
    {
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "valueAggregate": "3000000",
        "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "timestamp": 1740672000,
        "nonce": 2,
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "chainId": 84532
      },
      "signature": "0x2b3c4d5e..."
    },
    {
      "voucher": {
        "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
        "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
        "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
        "valueAggregate": "5000000",
        "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "timestamp": 1740673000,
        "nonce": 3,
        "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
        "chainId": 84532
      },
      "signature": "0x3a2f7e3b..."
    }
  ]
}
```

#### GET /deferred/vouchers/:id/:nonce

Get a specific voucher by ID and nonce.

**Path Parameters:**
- `id`: Voucher ID (bytes32)
- `nonce`: Voucher nonce (uint256)

**Query Parameters:**
- `chainId` (required): Chain ID
- `escrow` (required): Escrow contract address

**Example Request:**
```
GET /deferred/vouchers/0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc/3?chainId=84532&escrow=0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27
```

**Response (200 OK):**
```json
{
  "voucher": {
    "id": "0x9f8d3e4a2c7b9d04dcd11c9f4c2b22b0a6f87671e7b8c3a2ea95b5dbdf4040bc",
    "buyer": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    "seller": "0xA1c7Bf3d421e8A54D39FbBE13f9f826E5B2C8e3D",
    "valueAggregate": "5000000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "timestamp": 1740673000,
    "nonce": 3,
    "escrow": "0x7cB1A5A2a2C9e91B76914C0A7b7Fb3AefF3BCA27",
    "chainId": 84532
  },
  "signature": "0x3a2f7e3b..."
}
```

**Response (404 Not Found):**
```json
{
  "error": "Voucher not found"
}
```
