// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IDepositCollector} from "../interfaces/IDepositCollector.sol";

/// @title DepositCollector
/// @notice Abstract base for deposit collectors bound to a single x402BatchSettlement instance.
/// @dev All collectors MUST inherit this to ensure only the settlement contract can call collect(),
///      preventing frontrunning and fund theft.
abstract contract DepositCollector is IDepositCollector {
    address public immutable settlement;

    error OnlySettlement();
    error InvalidSettlementAddress();

    constructor(
        address _settlement
    ) {
        if (_settlement == address(0)) revert InvalidSettlementAddress();
        settlement = _settlement;
    }

    modifier onlySettlement() {
        if (msg.sender != settlement) revert OnlySettlement();
        _;
    }
}
