package erc20approvalgassponsor

// DeclareErc20ApprovalGasSponsoringExtension creates the extension declaration
// for inclusion in PaymentRequired.extensions.
//
// The server advertises that it (or its facilitator) supports ERC-20 raw approval
// gas sponsoring as a fallback for tokens that do not implement EIP-2612.
// The client will populate the info with the signed approval transaction.
//
// Returns a map keyed by the extension identifier.
//
// Example:
//
//	extensions := erc20approvalgassponsor.DeclareErc20ApprovalGasSponsoringExtension()
//	// Include in PaymentRequired.Extensions
func DeclareErc20ApprovalGasSponsoringExtension() map[string]interface{} {
	return map[string]interface{}{
		ERC20ApprovalGasSponsoring: Extension{
			Info: ServerInfo{
				Description: "The facilitator accepts a pre-signed ERC-20 approve(Permit2, amount) transaction to sponsor Permit2 allowance gas.",
				Version:     "1",
			},
			Schema: erc20ApprovalGasSponsoringSchema(),
		},
	}
}

// erc20ApprovalGasSponsoringSchema returns the JSON Schema for the extension info.
func erc20ApprovalGasSponsoringSchema() map[string]interface{} {
	return map[string]interface{}{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type":    "object",
		"properties": map[string]interface{}{
			"from": map[string]interface{}{
				"type":        "string",
				"pattern":     "^0x[a-fA-F0-9]{40}$",
				"description": "The address of the sender (token owner).",
			},
			"asset": map[string]interface{}{
				"type":        "string",
				"pattern":     "^0x[a-fA-F0-9]{40}$",
				"description": "The address of the ERC-20 token contract.",
			},
			"spender": map[string]interface{}{
				"type":        "string",
				"pattern":     "^0x[a-fA-F0-9]{40}$",
				"description": "The address of the spender (Canonical Permit2).",
			},
			"amount": map[string]interface{}{
				"type":        "string",
				"pattern":     "^[0-9]+$",
				"description": "The approval amount (uint256 as decimal string).",
			},
			"signedTransaction": map[string]interface{}{
				"type":        "string",
				"pattern":     "^0x[a-fA-F0-9]+$",
				"description": "The RLP-encoded signed approve transaction as a 0x-prefixed hex string.",
			},
			"version": map[string]interface{}{
				"type":        "string",
				"pattern":     `^[0-9]+(\.[0-9]+)*$`,
				"description": "Schema version identifier.",
			},
		},
		"required": []string{
			"from", "asset", "spender", "amount", "signedTransaction", "version",
		},
	}
}
