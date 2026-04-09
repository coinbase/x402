// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {Authorizable} from "./Authorizable.sol";

/// @title ClaimAuthorizer
/// @notice ERC-1271 periphery contract used as `ChannelConfig.receiverAuthorizer`.
///         Allows servers to rotate claim-signing keys without opening new channels.
///         Multiple authorizers are supported for redundancy and key rotation.
///
/// @dev    Validates that a signature was produced by one of the registered authorizer EOAs.
///         The server deploys this contract once and sets its address as `receiverAuthorizer`
///         in the channel config. To rotate keys, the server adds/removes authorizers on this
///         contract — no channel migration needed.
/// @author x402 Protocol
contract ClaimAuthorizer is Authorizable, IERC1271 {
    constructor(address[] memory _authorizers) Authorizable(_authorizers) {}

    /// @notice Validates that a signature was produced by one of this contract's authorizers.
    /// @param hash The digest to validate
    /// @param signature The ECDSA signature to check
    /// @return magicValue `0x1626ba7e` if valid, `0xffffffff` otherwise
    function isValidSignature(bytes32 hash, bytes calldata signature) external view override returns (bytes4) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(hash, signature);
        if (err == ECDSA.RecoverError.NoError && authorizers[recovered]) {
            return IERC1271.isValidSignature.selector;
        }
        return bytes4(0xffffffff);
    }
}
