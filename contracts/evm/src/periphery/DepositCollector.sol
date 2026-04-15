// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IDepositCollector} from "../interfaces/IDepositCollector.sol";

/// @title DepositCollector
/// @notice Abstract base for deposit collectors bound to a single `x402BatchSettlement` deployment.
///
/// @dev All collectors must inherit this so only the settlement contract can call `collect`,
///      mitigating frontrunning and theft of user funds.
///
/// @author Coinbase
abstract contract DepositCollector is IDepositCollector {
    /// @notice The batch settlement contract that may invoke `collect` on this collector.
    address public immutable settlement;

    /// @notice Thrown when `collect` is called by any address other than `settlement`.
    error OnlySettlement();

    /// @notice Thrown when the settlement address passed to the constructor is zero.
    error InvalidSettlementAddress();

    /// @param _settlement The `x402BatchSettlement` instance this collector serves.
    constructor(
        address _settlement
    ) {
        if (_settlement == address(0)) revert InvalidSettlementAddress();
        settlement = _settlement;
    }

    /// @dev Restricts the function body to calls originating from `settlement`.
    modifier onlySettlement() {
        if (msg.sender != settlement) revert OnlySettlement();
        _;
    }
}
