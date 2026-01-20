// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {x402ExactPermit2Proxy} from "../src/x402ExactPermit2Proxy.sol";
import {x402UptoPermit2Proxy} from "../src/x402UptoPermit2Proxy.sol";

/**
 * @title MineVanity
 * @notice Mine for vanity CREATE2 addresses for x402 Permit2 Proxies
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

    /// @notice Target prefix pattern (address should start with this after 0x)
    bytes constant PREFIX_PATTERN = hex"4020";

    /// @notice Target suffix for Exact contract (address should end with 01)
    bytes1 constant EXACT_SUFFIX = 0x01;

    /// @notice Target suffix for Upto contract (address should end with 02)
    bytes1 constant UPTO_SUFFIX = 0x02;

    /// @notice Maximum attempts before giving up
    uint256 constant MAX_ATTEMPTS = 100_000_000;

    function run() public view {
        console2.log("");
        console2.log("============================================================");
        console2.log("  x402 Vanity Address Miner");
        console2.log("============================================================");
        console2.log("");

        console2.log("Target pattern: 0x4020...XX");
        console2.log("  Exact suffix: 01");
        console2.log("  Upto suffix: 02");
        console2.log("Max attempts:", MAX_ATTEMPTS);
        console2.log("");

        // Mine for x402ExactPermit2Proxy
        console2.log("------------------------------------------------------------");
        console2.log("  Mining for x402ExactPermit2Proxy (0x4020...01)");
        console2.log("------------------------------------------------------------");
        _mineForContract("x402-exact-v2-", type(x402ExactPermit2Proxy).creationCode, EXACT_SUFFIX);

        // Mine for x402UptoPermit2Proxy
        console2.log("");
        console2.log("------------------------------------------------------------");
        console2.log("  Mining for x402UptoPermit2Proxy (0x4020...02)");
        console2.log("------------------------------------------------------------");
        _mineForContract("x402-upto-v2-", type(x402UptoPermit2Proxy).creationCode, UPTO_SUFFIX);
    }

    function _mineForContract(string memory prefix, bytes memory creationCode, bytes1 targetSuffix) internal pure {
        bytes memory initCode = abi.encodePacked(creationCode, abi.encode(PERMIT2));
        bytes32 initCodeHash = keccak256(initCode);

        console2.log("Init code hash:", vm.toString(initCodeHash));
        console2.log("Mining...");

        bool found = false;
        bytes32 bestSalt;
        address bestAddress;
        uint256 bestScore = 0;

        for (uint256 i = 0; i < MAX_ATTEMPTS; i++) {
            bytes32 salt = keccak256(abi.encodePacked(prefix, i));
            address addr = _computeCreate2Addr(salt, initCodeHash, CREATE2_DEPLOYER);
            (uint256 prefixMatch, bool suffixMatch) = checkPatternMatch(addr, targetSuffix);

            // Score: prefix match count * 10 + suffix match bonus
            uint256 score = prefixMatch * 10 + (suffixMatch ? 100 : 0);

            if (score > bestScore) {
                bestScore = score;
                bestSalt = salt;
                bestAddress = addr;

                console2.log("  New best at attempt", i);
                console2.log("    Address:", bestAddress);
                console2.log("    Prefix match:", prefixMatch, "bytes");
                console2.log("    Suffix match:", suffixMatch);

                // Full match: prefix matches and suffix matches
                if (prefixMatch >= PREFIX_PATTERN.length && suffixMatch) {
                    found = true;
                    break;
                }
            }

            if (i > 0 && i % 1_000_000 == 0) {
                console2.log("  Checked", i, "salts...");
            }
        }

        if (found) {
            console2.log("");
            console2.log("FOUND MATCH!");
            console2.log("  Salt:", vm.toString(bestSalt));
            console2.log("  Address:", bestAddress);
        } else {
            console2.log("");
            console2.log("No exact match found after", MAX_ATTEMPTS, "attempts.");
            console2.log("  Best partial match:", bestAddress);
            console2.log("  Best salt:", vm.toString(bestSalt));
        }
    }

    function _computeCreate2Addr(
        bytes32 salt,
        bytes32 initCodeHash,
        address deployer
    ) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }

    function checkPatternMatch(
        address addr,
        bytes1 targetSuffix
    ) internal pure returns (uint256 prefixMatch, bool suffixMatch) {
        bytes20 addrBytes = bytes20(addr);

        // Check prefix match
        prefixMatch = 0;
        for (uint256 i = 0; i < PREFIX_PATTERN.length && i < 20; i++) {
            if (addrBytes[i] == PREFIX_PATTERN[i]) {
                prefixMatch++;
            } else {
                break;
            }
        }

        // Check suffix match (last byte)
        suffixMatch = addrBytes[19] == targetSuffix;
    }
}
