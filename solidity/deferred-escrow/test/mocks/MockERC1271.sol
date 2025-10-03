// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/**
 * @title MockERC1271
 * @notice Mock smart contract wallet for testing ERC-1271 signature validation
 */
contract MockERC1271 is IERC1271 {
    bytes4 internal constant MAGICVALUE = 0x1626ba7e;
    bytes4 internal constant INVALID_SIGNATURE = 0xffffffff;

    mapping(bytes32 => bool) public validHashes;

    function setValidHash(bytes32 hash, bool isValid) external {
        validHashes[hash] = isValid;
    }

    function isValidSignature(bytes32 hash, bytes memory) external view override returns (bytes4 magicValue) {
        return validHashes[hash] ? MAGICVALUE : INVALID_SIGNATURE;
    }
}
