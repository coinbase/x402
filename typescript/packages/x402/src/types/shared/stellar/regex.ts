export const StellarDestinationAddressRegex = /^(?:[GC][ABCD][A-Z2-7]{54}|M[ABCD][A-Z2-7]{67})$/; // Stellar address: G-account (56 chars), C-account (56 chars), or M-account (69 chars, muxed)
export const StellarAssetAddressRegex = /^(?:[C][ABCD][A-Z2-7]{54})$/; // Stellar token contract address: C-account (56 chars)
