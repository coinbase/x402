// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Authorizable} from "./Authorizable.sol";

/// @title PaymentRouter
/// @notice Periphery contract that acts as a mutable `receiver` for x402 payment channels.
///         Set this contract's address as `ChannelConfig.receiver`. When the settlement
///         contract calls `settle()`, funds arrive here. Authorizers can then call
///         `forward()` to route funds to the current destination, and `updateDestination()`
///         to change where funds go — without opening a new channel.
///
/// @dev    Usable with any x402 scheme (exact, upto, batch-settlement) — any contract
///         that sends ERC-20 tokens to a receiver address.
/// @author x402 Protocol
contract PaymentRouter is Authorizable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Storage
    // =========================================================================

    address public destination;

    // =========================================================================
    // Events
    // =========================================================================

    event DestinationUpdated(address indexed oldDestination, address indexed newDestination);
    event Forwarded(address indexed token, address indexed to, uint256 amount);

    // =========================================================================
    // Errors
    // =========================================================================

    error NothingToForward();

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @param _destination Initial forwarding destination
    /// @param _authorizers Initial set of authorizers (at least one required)
    constructor(address _destination, address[] memory _authorizers) Authorizable(_authorizers) {
        if (_destination == address(0)) revert InvalidAddress();
        destination = _destination;
        emit DestinationUpdated(address(0), _destination);
    }

    // =========================================================================
    // Core Functions
    // =========================================================================

    /// @notice Forward the entire balance of a token to the current destination.
    function forward(address token) external onlyAuthorizer {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) revert NothingToForward();

        IERC20(token).safeTransfer(destination, bal);

        emit Forwarded(token, destination, bal);
    }

    /// @notice Forward a specific amount of a token to the current destination.
    function forward(address token, uint256 amount) external onlyAuthorizer {
        if (amount == 0) revert NothingToForward();

        IERC20(token).safeTransfer(destination, amount);

        emit Forwarded(token, destination, amount);
    }

    /// @notice Update the forwarding destination.
    function updateDestination(address newDestination) external onlyAuthorizer {
        if (newDestination == address(0)) revert InvalidAddress();

        address old = destination;
        destination = newDestination;

        emit DestinationUpdated(old, newDestination);
    }
}
