// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IDepositCollector
/// @notice Interface for pluggable deposit collectors used by x402BatchSettlement.
/// @dev Collectors handle the token transfer mechanics (ERC-3009, Permit2, etc.)
///      while the settlement contract verifies actual token receipt via balance checks.
interface IDepositCollector {
    /// @notice Pull tokens from payer to recipient using collector-specific authorization logic.
    /// @param payer The address that owns the tokens being deposited
    /// @param token The ERC-20 token address
    /// @param recipient The address that should receive the tokens (the settlement contract)
    /// @param amount The exact amount of tokens to transfer
    /// @param channelId The channel identifier (used by Permit2 collectors for witness binding)
    /// @param collectorData Opaque bytes containing collector-specific parameters (signatures, nonces, etc.)
    function collect(
        address payer,
        address token,
        address recipient,
        uint256 amount,
        bytes32 channelId,
        bytes calldata collectorData
    ) external;
}
