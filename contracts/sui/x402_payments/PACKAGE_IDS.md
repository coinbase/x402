# X402 Payments Contract - Package IDs

This document contains the published package IDs for the x402 payments contract on different Sui networks.

## Package IDs

### Testnet
- **Package ID**: `0xb91e93029e6ff5c321731c07bcea75da5e1dba98f3b218c888043bbfb7ab31bb`
- **Transaction**: `5pYsf6ZbCxrhG8EYuc5Q6YbevqiRdFBgt7hMpLq2r9hN`
- **Explorer**: https://testnet.suivision.xyz/package/0xb91e93029e6ff5c321731c07bcea75da5e1dba98f3b218c888043bbfb7ab31bb

### Mainnet
- **Package ID**: `0xe4ee6413abcbcaf7a7dfdc2beecc38d44008bfe0d3b294ea3d2a6c2f863256d6`
- **Transaction**: `4bEFunBPnL7ptnYzsjZrDdEUaA8usHq5kRmib32J9V8u`
- **Explorer**: https://suivision.xyz/package/0xe4ee6413abcbcaf7a7dfdc2beecc38d44008bfe0d3b294ea3d2a6c2f863256d6

## Module Information

- **Module Name**: `payments`
- **Main Function**: `make_payment<T>`
- **Events**: `PaymentMade<T>`

## Usage

To call the contract functions:

### Testnet
```move
use 0xb91e93029e6ff5c321731c07bcea75da5e1dba98f3b218c888043bbfb7ab31bb::payments;
```

### Mainnet
```move
use 0xe4ee6413abcbcaf7a7dfdc2beecc38d44008bfe0d3b294ea3d2a6c2f863256d6::payments;
```

## Function Signature

```move
public fun make_payment<T>(
    payment_coin: Coin<T>,
    expected_amount: u64,
    recipient: address,
    invoice_id: vector<u8>,
)
```

The function:
1. Verifies the coin value exactly matches the expected amount
2. Emits a PaymentMade event with payment details
3. Transfers the coin to the recipient address