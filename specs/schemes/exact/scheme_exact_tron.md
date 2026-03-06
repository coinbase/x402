Exact Payment Scheme for TRON (TVM) (exact)
This document specifies the exact payment scheme for the x402 protocol on TRON networks. This scheme facilitates payments of a specific amount of a TRC-20 token (e.g., USDT, USDC) on the TRON blockchain.
Scheme Name
exact
Supported Networks
Network
CAIP-2 Identifier
TRON Mainnet
tron:27Lqcw
Shasta Testnet
tron:4oPwXB
Nile Testnet
tron:6FhfKq
Wildcard: tron:* matches all TRON networks.
Supported Assets
Token
Contract Address (Mainnet)
Decimals
USDT
TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
6
USDC
TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8
6
Protocol Flow
The protocol flow for exact on TRON is client-driven:
Client makes an HTTP request to a Resource Server.
Resource Server responds with a 402 Payment Required status containing PaymentRequired with an accepts array that includes the exact scheme on a tron:* network.
Client reads the PaymentRequirements, noting the asset, amount, payTo, and maxTimeoutSeconds.
Client constructs a TriggerSmartContract transaction calling transfer(address,uint256) on the TRC-20 token contract, with the recipient set to payTo and the value set to amount.
Client signs the transaction using their TRON private key via trx.sign(). This produces a complete signed transaction object including txID, raw_data, raw_data_hex, and signature.
The client does NOT broadcast the transaction. The signed transaction is passed to the facilitator via the payment payload.
Client constructs the PaymentPayload containing the signed transaction and the payer's address, base64-encodes it, and sends it in the X-PAYMENT header with the original HTTP request.
Resource Server receives the request and forwards the PaymentPayload and PaymentRequirements to a Facilitator's /verify endpoint.
Facilitator performs all verification checks (see Facilitator Verification Rules below).
If verification passes, Facilitator returns { "isValid": true } to the Resource Server.
Resource Server serves the requested resource to the Client.
Resource Server (or Facilitator) calls the Facilitator's /settle endpoint.
Facilitator broadcasts the signed transaction to the TRON network via trx.sendRawTransaction().
Facilitator returns the SettlementResponse containing the on-chain transaction ID.
PaymentRequirements
{
  "scheme": "exact",
  "network": "tron:27Lqcw",
  "amount": "1000000",
  "asset": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  "payTo": "TXYZabc123merchantAddress",
  "maxTimeoutSeconds": 60,
  "extra": {
    "name": "USDT",
    "decimals": 6
  }
}
scheme: MUST be "exact".
network: A CAIP-2 identifier for the TRON network.
amount: The amount to be transferred in the token's smallest unit. For USDT/USDC with 6 decimals, "1000000" = $1.00.
asset: The TRC-20 token contract address in base58check format (T-prefix).
payTo: The TRON address (base58check format) of the resource server receiving the funds.
maxTimeoutSeconds: Maximum time in seconds the payment authorization remains valid.
extra.name: Human-readable token name (informational).
extra.decimals: Token decimal places (informational).
PaymentPayload
{
  "x402Version": 2,
  "resource": {
    "url": "https://example.com/weather",
    "description": "Access to protected content",
    "mimeType": "application/json"
  },
  "accepted": {
    "scheme": "exact",
    "network": "tron:27Lqcw",
    "amount": "1000000",
    "asset": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    "payTo": "TXYZabc123merchantAddress",
    "maxTimeoutSeconds": 60,
    "extra": {
      "name": "USDT",
      "decimals": 6
    }
  },
  "payload": {
    "signedTransaction": {
      "txID": "a1b2c3d4e5f6...",
      "raw_data": {
        "contract": [{
          "parameter": {
            "value": {
              "data": "a9059cbb000000000000000000000000...",
              "owner_address": "41...",
              "contract_address": "41..."
            },
            "type_url": "type.googleapis.com/protocol.TriggerSmartContract"
          },
          "type": "TriggerSmartContract"
        }],
        "ref_block_bytes": "...",
        "ref_block_hash": "...",
        "expiration": 1740672154000,
        "timestamp": 1740672089000
      },
      "raw_data_hex": "0a02...",
      "signature": ["3045..."]
    },
    "from": "TXYZabc123payerAddress"
  }
}
Payload Fields
signedTransaction: The complete signed TRON transaction object as returned by TronWeb's trx.sign(). This MUST be a TriggerSmartContract transaction calling transfer(address,uint256) on the TRC-20 token contract.
signedTransaction.raw_data: JSON representation of the transaction body. Provided for informational convenience only (see Verification Rules).
signedTransaction.raw_data_hex: Hex-encoded serialized transaction body. This is the authoritative representation used for signature verification and field extraction.
signedTransaction.signature: Array containing the secp256k1 signature over raw_data_hex.
from: The payer's TRON address (base58check format). Used for verification against the transaction's owner_address.
SettlementResponse
{
  "success": true,
  "transaction": "a1b2c3d4e5f6...",
  "network": "tron:27Lqcw",
  "payer": "TXYZabc123payerAddress"
}
transaction: The TRON transaction ID (txID) of the broadcast transaction.
payer: The TRON address of the client that signed the transaction.
Facilitator Verification Rules (MUST)
A facilitator verifying an exact-scheme TRON payment MUST enforce all of the following checks before broadcasting the transaction.
Authoritative data source: raw_data_hex is the authoritative representation of the transaction body. All field extractions during verification — including recipient address, token contract address, call value, and call data — MUST be derived by parsing raw_data_hex directly. The raw_data JSON object is provided for informational convenience only and MUST NOT be trusted for verification purposes. This prevents a class of attacks where a malicious client provides a valid signature over raw_data_hex while supplying inconsistent field values in the raw_data JSON to mislead facilitator verification logic.
1. Transaction Layout
The transaction MUST be a TriggerSmartContract type.
The contract array MUST contain exactly one contract invocation.
The first 4 bytes of parameter.value.data (extracted from raw_data_hex) MUST match the transfer(address,uint256) function selector (a9059cbb).
2. Token Contract Address
The contract_address extracted from raw_data_hex MUST match the asset from PaymentRequirements after address format normalization (see Rule 3 for canonical conversion).
3. Recipient Address
The decoded recipient address (bytes 16–35 of the ABI-encoded address parameter in the transfer call data, extracted from raw_data_hex) MUST match the payTo address from PaymentRequirements.
Because payTo is expressed as a base58check TRON address (T-prefix) while ABI-decoded addresses are 20-byte hex values (with the 0x41 network prefix stripped for EVM ABI encoding), implementations MUST convert both addresses to a common format before comparison. The canonical conversion path is: decode the base58check payTo address to bytes, strip the leading 0x41 network byte and the 4-byte checksum to yield 20 raw bytes, then compare against the 20-byte ABI-decoded address. Alternatively, implementations MAY convert the ABI-decoded 20 bytes back to base58check by prepending 0x41, computing the double-SHA256 checksum, appending the first 4 bytes, and base58-encoding — then compare the resulting T-address string directly against payTo.
4. Transfer Amount
The uint256 value decoded from the transfer call data (extracted from raw_data_hex) MUST be greater than or equal to the amount in PaymentRequirements.
5. Signature Verification
The facilitator MUST verify that the signature is a valid secp256k1 signature over the SHA-256 hash of the hex-decoded raw_data_hex.
The recovered public key MUST correspond to the owner_address in the transaction AND to the from field in the payment payload.
6. Transaction Expiration
The expiration field in the transaction (extracted from raw_data_hex) MUST be in the future at the time of verification.
The facilitator SHOULD reject transactions with an expiration more than maxTimeoutSeconds beyond the current time.
7. Sender Balance
The facilitator MUST verify that the from address holds a TRC-20 token balance greater than or equal to the transfer amount by querying the token contract's balanceOf function.
8. Replay Protection
The facilitator MUST maintain a set of recently seen txID values and reject any payment whose txID has already been processed.
The replay protection window SHOULD be at least as long as maxTimeoutSeconds.
9. Network Match
The network field in the PaymentPayload.accepted MUST match the network in the PaymentRequirements.
10. Scheme Match
The scheme field MUST be "exact".
11. Amount Consistency
The amount in PaymentPayload.accepted MUST match the amount in the original PaymentRequirements.
Settlement
Upon settlement, the facilitator:
Broadcasts the signed transaction to the TRON network via trx.sendRawTransaction().
Waits for confirmation (recommended: at least 19 confirmations for finality on TRON mainnet).
Verifies the transaction was successful on-chain by checking the transaction receipt.
Returns the SettlementResponse with the on-chain txID.
The facilitator pays the energy and bandwidth costs for broadcasting. The client and resource server do not need TRX for gas.
Security Considerations
Trust Model — Transaction Broadcast Window
Unlike EVM chain specs that use a delegated authorization pattern (e.g., ERC-3009 transferWithAuthorization), the TRON scheme requires the client to construct and sign a complete TriggerSmartContract transaction. The facilitator holds this fully-formed signed transaction between verification and settlement. The broadcast window is bounded by TRON's ref_block mechanism — every transaction references a recent block hash and has an expiration field (typically 60 seconds from creation). If the facilitator does not broadcast within this window, the transaction becomes invalid on-chain and cannot be executed. Implementors SHOULD set the expiration field to the minimum acceptable window (recommended: 60–120 seconds) to minimize the period during which the facilitator holds a valid signed transaction.
Replay Protection
TRON transactions are uniquely identified by their txID (SHA-256 of raw_data_hex). Once broadcast and confirmed, the network rejects duplicate transaction IDs. Facilitators MUST additionally maintain an in-memory or persistent set of processed txID values to prevent replay at the application layer before broadcast.
Address Format
TRON addresses use base58check encoding with a 0x41 network prefix (yielding addresses starting with "T"). Implementations MUST validate address format before processing and MUST handle the hex-to-base58check conversion correctly when comparing addresses across different representations (see Verification Rule 3).
Double-Spend Risk
Because the client signs a complete transaction rather than a meta-transaction authorization, the client could theoretically broadcast the transaction themselves before the facilitator does, or move their TRC-20 balance between verification and settlement. Facilitators SHOULD minimize the time between verification and settlement. If the broadcast fails due to insufficient balance, the facilitator MUST return an error and MUST NOT serve the resource.
Differences from EVM Exact Scheme
Feature
EVM (eip155:*)
TRON (tron:*)
Meta-transactions
EIP-3009 transferWithAuthorization
Signed TriggerSmartContract (not broadcast by client)
Gas model
ETH gas fees
Energy / Bandwidth (TRX)
Signing
EIP-712 typed data
TRON secp256k1 over raw_data_hex
Address format
0x-prefixed hex (20 bytes)
Base58check (T-prefix, 21 bytes + 4 checksum)
Block time
~2s (Base L2)
~3s
Primary stablecoin
USDC
USDT ($61B+ circulation on TRON)
Smart contract language
Solidity (EVM)
Solidity (TVM, EVM-compatible)
Authoritative tx data
N/A (EIP-712 typed struct)
raw_data_hex (NOT raw_data JSON)
Reference Implementation
Component
Location
npm package
@erudite-intelligence/x402-tron-v2
GitHub
EruditeIntelligence/x402-tron-v2
Facilitator
Erudite Intelligence LLC (FinCEN-registered MSB #31000283503553)
