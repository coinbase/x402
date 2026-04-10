// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IDepositCollector
/// @notice Interface for pluggable deposit collectors used by x402BatchSettlement.
/// @dev Collectors handle the token transfer mechanics (ERC-3009, Permit2, etc.)
///      while the settlement contract verifies actual token receipt via balance checks.
///      Collectors MUST transfer tokens to msg.sender (the settlement contract).
interface IDepositCollector {
    /// @notice Pull tokens from payer to the calling settlement contract.
    /// @param payer The address that owns the tokens being deposited
    /// @param token The ERC-20 token address
    /// @param amount The exact amount of tokens to transfer
    /// @param channelId The channel identifier (used by Permit2 collectors for witness binding)
    /// @param caller The address that called deposit() on the settlement contract
    /// @param collectorData Opaque bytes containing collector-specific parameters (signatures, nonces, etc.)
    function collect(
        address payer,
        address token,
        uint256 amount,
        bytes32 channelId,
        address caller,
        bytes calldata collectorData
    ) external;
}
