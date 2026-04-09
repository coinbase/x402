// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Authorizable
/// @notice Abstract base for multi-authorizer access control.
///         Maintains a set of authorized addresses with add/remove operations
///         and a minimum-one invariant (cannot remove the last authorizer).
/// @author x402 Protocol
abstract contract Authorizable {
    // =========================================================================
    // Storage
    // =========================================================================

    mapping(address => bool) public authorizers;
    uint256 public authorizerCount;

    // =========================================================================
    // Events
    // =========================================================================

    event AuthorizerAdded(address indexed authorizer);
    event AuthorizerRemoved(address indexed authorizer);

    // =========================================================================
    // Errors
    // =========================================================================

    error NotAuthorizer();
    error InvalidAddress();
    error LastAuthorizer();
    error AlreadyAuthorizer();

    // =========================================================================
    // Modifiers
    // =========================================================================

    modifier onlyAuthorizer() {
        if (!authorizers[msg.sender]) revert NotAuthorizer();
        _;
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(address[] memory _authorizers) {
        if (_authorizers.length == 0) revert InvalidAddress();

        for (uint256 i = 0; i < _authorizers.length; ++i) {
            if (_authorizers[i] == address(0)) revert InvalidAddress();
            if (authorizers[_authorizers[i]]) revert AlreadyAuthorizer();
            authorizers[_authorizers[i]] = true;
        }
        authorizerCount = _authorizers.length;
    }

    // =========================================================================
    // Authorizer Management
    // =========================================================================

    function addAuthorizer(address account) external onlyAuthorizer {
        if (account == address(0)) revert InvalidAddress();
        if (authorizers[account]) revert AlreadyAuthorizer();

        authorizers[account] = true;
        authorizerCount += 1;

        emit AuthorizerAdded(account);
    }

    function removeAuthorizer(address account) external onlyAuthorizer {
        if (!authorizers[account]) revert NotAuthorizer();
        if (authorizerCount <= 1) revert LastAuthorizer();

        authorizers[account] = false;
        authorizerCount -= 1;

        emit AuthorizerRemoved(account);
    }
}
