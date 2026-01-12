// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {x402Permit2Proxy} from "../src/x402Permit2Proxy.sol";

/**
 * @title MineVanity
 * @notice Mine for a vanity CREATE2 address
 * @dev Run with: forge script script/MineVanity.s.sol
 *
 * Note: For serious vanity mining, consider using a more efficient tool like:
 * - create2crunch (Rust): https://github.com/0age/create2crunch
 * - Or the TypeScript version in typescript/packages/contracts/evm/scripts/
 */
contract MineVanity is Script {
    /// @notice Canonical Permit2 address
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Arachnid's deterministic CREATE2 deployer
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @notice Target pattern (address should start with this after 0x)
    bytes constant PATTERN = hex"4020";

    /// @notice Maximum attempts before giving up
    uint256 constant MAX_ATTEMPTS = 1_000_000;

    function run() public view {
        console2.log("");
        console2.log("============================================================");
        console2.log("  x402 Vanity Address Miner");
        console2.log("============================================================");
        console2.log("");

        console2.log("Target pattern: 0x4020...");
        console2.log("Max attempts:", MAX_ATTEMPTS);
        console2.log("");

        // Compute init code
        bytes memory initCode = abi.encodePacked(type(x402Permit2Proxy).creationCode, abi.encode(PERMIT2));
        bytes32 initCodeHash = keccak256(initCode);

        console2.log("Init code hash:", vm.toString(initCodeHash));
        console2.log("");
        console2.log("Mining...");
        console2.log("");

        bool found = false;
        bytes32 bestSalt;
        address bestAddress;
        uint256 bestMatchLength = 0;

        for (uint256 i = 0; i < MAX_ATTEMPTS; i++) {
            // Generate salt from iteration
            bytes32 salt = keccak256(abi.encodePacked("x402-x402permit2proxy-v", i));

            // Compute address
            address addr = _computeCreate2Addr(salt, initCodeHash, CREATE2_DEPLOYER);

            // Check if matches pattern
            uint256 matchLength = checkPatternMatch(addr);

            if (matchLength > bestMatchLength) {
                bestMatchLength = matchLength;
                bestSalt = salt;
                bestAddress = addr;

                if (matchLength >= PATTERN.length) {
                    found = true;
                    break;
                }
            }

            // Progress logging
            if (i > 0 && i % 100_000 == 0) {
                console2.log("  Checked", i, "salts...");
                console2.log("  Best so far:", bestAddress);
            }
        }

        console2.log("");
        if (found) {
            console2.log("FOUND MATCH!");
            console2.log("  Salt:", vm.toString(bestSalt));
            console2.log("  Address:", bestAddress);
        } else {
            console2.log("No exact match found.");
            console2.log("  Best partial match:", bestAddress);
            console2.log("  Best salt:", vm.toString(bestSalt));
            console2.log("");
            console2.log("Tips:");
            console2.log("  - For faster mining, use create2crunch (Rust)");
            console2.log("  - Or the TypeScript miner in the original package");
        }
        console2.log("");
    }

    function _computeCreate2Addr(
        bytes32 salt,
        bytes32 initCodeHash,
        address deployer
    ) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }

    function checkPatternMatch(
        address addr
    ) internal pure returns (uint256) {
        bytes20 addrBytes = bytes20(addr);
        uint256 matchCount = 0;

        for (uint256 i = 0; i < PATTERN.length && i < 20; i++) {
            if (addrBytes[i] == PATTERN[i]) {
                matchCount++;
            } else {
                break;
            }
        }

        return matchCount;
    }
}
