// Constants
export const EvmMaxAtomicUnits = 18;
export const EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
export const SvmAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const MixedAddressRegex = /^0x[a-fA-F0-9]{40}|[A-Za-z0-9][A-Za-z0-9-]{0,34}[A-Za-z0-9]$/;
export const HexEncoded64ByteRegex = /^0x[0-9a-fA-F]{64}$/;
export const HexEncoded32ByteRegex = /^0x[0-9a-fA-F]{32}$/;
export const EvmSignatureRegex = /^0x[0-9a-fA-F]+$/; // Flexible hex signature validation
export const EvmTransactionHashRegex = /^0x[0-9a-fA-F]{64}$/;
