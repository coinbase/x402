# Scheme: `exact:multiversx` `multiversx`

## Summary

This scheme facilitates payments on the MultiversX blockchain using Relayed Transactions (v3). This allows users to make payments without holding EGLD for gas fees, as these are handled by the facilitator or resource server. The transaction requires signatures from both the user and the facilitator, preventing the resource server from unilaterally submitting transactions.

## `X-Payment` header payload

The `402 Payment Required` response from the resource server MUST include `paymentRequirements` with the following MultiversX-specific details:
*   `chainID` (string): The target MultiversX chain ID (e.g., "1" for Mainnet, "T" for Testnet).
*   `transactionVersion` (number): The MultiversX transaction version (e.g., 2 or as appropriate for Relayed v3).
*   `receiverAddress` (string): The bech32 encoded address of the recipient.
*   `amount` (string): The amount of tokens to be transferred, in atomic units (e.g., for 1 EGLD, use "1000000000000000000").
*   `tokenIdentifier` (string, optional): The token identifier if not EGLD (e.g., "MYTOKEN-abcdef"). Defaults to EGLD.
*   `gasPrice` (number): The gas price for the transaction.
*   `gasLimitForInnerTx` (number): The gas limit for the core operation (e.g., the transfer itself). The client will use this to calculate the total gas limit for the relayed transaction.
*   `relayerAddress` (string): The bech32 encoded address of the facilitator that will relay the transaction.
*   `data` (string, optional): An optional data field for the transaction, base64 encoded.

The client constructs a MultiversX transaction object including these fields, plus:
*   `sender`: The user's bech32 encoded address.
*   `nonce`: The user's account nonce.
*   `gasLimit`: Calculated as `gasLimitForInnerTx` + `50000` (the base cost for a relayed v3 operation).
*   `relayer`: Set to the `relayerAddress` provided.

The user signs this transaction object. The `X-Payment` header will then contain a JSON string representing this transaction object, with the `signature` field populated by the user's signature. The `relayerSignature` field will be absent or null at this stage.

Example `X-Payment` header value (JSON stringified):
```json
{
  "nonce": 10,
  "value": "100000000000000000", // 0.1 EGLD
  "receiver": "erd1...", // Resource server's address
  "sender": "erd1...", // User's address
  "gasPrice": 1000000000,
  "gasLimit": 70000, // e.g., 20000 (inner) + 50000 (relayed base)
  "chainID": "T",
  "version": 2,
  "relayer": "erd1...", // Facilitator's address
  "signature": "users_signature_hex_encoded"
  // relayerSignature is not present here
}
```

## Verification

The facilitator (which may be the resource server or a separate entity designated by it) performs the following steps upon receiving the `X-Payment` payload:

1.  **Parse Payload**: Deserialize the JSON string from the `X-Payment` header into a transaction object.
2.  **Verify User Signature**: Cryptographically verify the `signature` field against the transaction data using the `sender`'s public key.
3.  **Check Transaction Details**:
    *   Ensure the `receiver` address matches the expected recipient address for the resource/service.
    *   Ensure the `value` (amount) and `tokenIdentifier` (if applicable) match the expected payment.
    *   Verify that the `relayer` field in the transaction correctly identifies the facilitator's address.
    *   Validate `chainID`, `transactionVersion`, `gasPrice`, and `gasLimit` for appropriateness and consistency with network conditions and facilitator's policies. The `gasLimit` should be sufficient for the inner transaction plus the relayed overhead.
4.  **Check User Account State (Optional but Recommended)**:
    *   Verify if the `sender` account has a sufficient balance of the token being sent if the transaction involved a token transfer that isn't covered by the facilitator (though typically for relayed tx, the user might not have EGLD, but they must have the asset they are sending if it's not EGLD).
    *   Check the `nonce` provided against the current nonce of the `sender` account on the blockchain to prevent replay attacks.

## Settlement

1.  **Facilitator Signature**: If all verification steps pass, the facilitator signs the transaction. This signature is placed in the `relayerSignature` field of the transaction object.
2.  **Transaction Submission**: The facilitator broadcasts the fully formed and signed (by user and relayer) relayed transaction to the MultiversX network.
3.  **Confirmation Monitoring**:
    *   The facilitator should monitor the transaction's inclusion and execution on the blockchain.
    *   Upon successful execution, the facilitator informs the resource server (if separate).
4.  **Resource Provisioning**: The resource server, once notified of successful settlement (or by observing the transaction on-chain itself), grants the user access to the requested resource.
    *   The resource server should independently verify the transaction details on-chain (amount, sender, receiver, token) before considering the payment settled, using the transaction hash provided by the facilitator or found by other means.

## Appendix

- MultiversX Relayed Transactions v3 Documentation: [https://docs.multiversx.com/developers/relayed-transactions/#relayed-transactions-version-3](https://docs.multiversx.com/developers/relayed-transactions/#relayed-transactions-version-3)
- The base gas cost for a relayed operation in v3 is 50,000 gas units. This must be added to the gas limit of the inner transaction.
