// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Authorizable} from "./Authorizable.sol";

/// @title PaymentSplitter
/// @notice Periphery contract that acts as a mutable `receiver` for x402 payment channels
///         and distributes settled funds to multiple payees by basis-point shares.
///
///         Set this contract's address as `ChannelConfig.receiver`. When the settlement
///         contract calls `settle()`, funds arrive here. Authorizers can then call
///         `distribute()` to split the balance across payees per their configured shares,
///         and `updatePayees()` to change the split — without opening a new channel.
///
/// @dev    Shares are expressed in basis points (1 bp = 0.01%). All shares must sum to
///         10_000 (100%). Minimum 1 payee, maximum 20 payees.
/// @author x402 Protocol
contract PaymentSplitter is Authorizable {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Constants
    // =========================================================================

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PAYEES = 20;

    // =========================================================================
    // Structs
    // =========================================================================

    struct Payee {
        address account;
        uint16 shareBps;
    }

    // =========================================================================
    // Storage
    // =========================================================================

    Payee[] internal _payees;

    // =========================================================================
    // Events
    // =========================================================================

    event PayeesUpdated(Payee[] payees);
    event Distributed(address indexed token, uint256 totalAmount);

    // =========================================================================
    // Errors
    // =========================================================================

    error NothingToDistribute();
    error InvalidShares();
    error TooManyPayees();
    error NoPayees();

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @param initialPayees Initial set of payees with shares (must sum to BPS_DENOMINATOR)
    /// @param _authorizers  Initial set of authorizers (at least one required)
    constructor(Payee[] memory initialPayees, address[] memory _authorizers) Authorizable(_authorizers) {
        _setPayees(initialPayees);
    }

    // =========================================================================
    // Core Functions
    // =========================================================================

    /// @notice Distribute the entire balance of a token to payees according to their shares.
    function distribute(address token) external onlyAuthorizer {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) revert NothingToDistribute();

        _distribute(token, bal);
    }

    /// @notice Distribute a specific amount of a token to payees according to their shares.
    function distribute(address token, uint256 amount) external onlyAuthorizer {
        if (amount == 0) revert NothingToDistribute();

        _distribute(token, amount);
    }

    /// @notice Replace the entire payee list and share allocation.
    function updatePayees(Payee[] calldata newPayees) external onlyAuthorizer {
        delete _payees;
        _setPayees(newPayees);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    function getPayees() external view returns (Payee[] memory) {
        return _payees;
    }

    function payeeCount() external view returns (uint256) {
        return _payees.length;
    }

    // =========================================================================
    // Internal
    // =========================================================================

    function _setPayees(Payee[] memory payees) internal {
        if (payees.length == 0) revert NoPayees();
        if (payees.length > MAX_PAYEES) revert TooManyPayees();

        uint256 totalBps;
        for (uint256 i = 0; i < payees.length; ++i) {
            if (payees[i].account == address(0)) revert InvalidAddress();
            if (payees[i].shareBps == 0) revert InvalidShares();
            _payees.push(payees[i]);
            totalBps += payees[i].shareBps;
        }

        if (totalBps != BPS_DENOMINATOR) revert InvalidShares();

        emit PayeesUpdated(payees);
    }

    function _distribute(address token, uint256 total) internal {
        uint256 remaining = total;
        uint256 len = _payees.length;

        for (uint256 i = 0; i < len - 1; ++i) {
            uint256 share = (total * _payees[i].shareBps) / BPS_DENOMINATOR;
            remaining -= share;
            IERC20(token).safeTransfer(_payees[i].account, share);
        }

        IERC20(token).safeTransfer(_payees[len - 1].account, remaining);

        emit Distributed(token, total);
    }
}
