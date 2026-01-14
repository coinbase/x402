// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";

import {x402Permit2Proxy} from "../src/x402Permit2Proxy.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";

/**
 * @title ComputeAddress
 * @notice Compute the deterministic CREATE2 address for x402Permit2Proxy
 *
 * @dev Run with default salt:
 *      forge script script/ComputeAddress.s.sol
 *
 * @dev Run with custom salt:
 *      forge script script/ComputeAddress.s.sol --sig "computeAddress(bytes32)" <SALT>
 */
contract ComputeAddress is Script {
    /// @notice Canonical Permit2 address
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Arachnid's deterministic CREATE2 deployer
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @notice Default salt for deterministic deployment
    bytes32 constant DEFAULT_SALT = 0x62bb59fa735c572ac45816aa0f1e00b2de3c4671993a9147999a3808c574240e;

    /**
     * @notice Computes the CREATE2 address using the default salt
     */
    function run() public view {
        computeAddress(DEFAULT_SALT);
    }

    /**
     * @notice Computes the CREATE2 address for x402Permit2Proxy
     * @param salt The salt to use for CREATE2 address computation
     */
    function computeAddress(
        bytes32 salt
    ) public view {
        console2.log("");
        console2.log("============================================================");
        console2.log("  x402Permit2Proxy Address Computation");
        console2.log("============================================================");
        console2.log("");

        // Compute init code
        bytes memory initCode = abi.encodePacked(type(x402Permit2Proxy).creationCode, abi.encode(PERMIT2));
        bytes32 initCodeHash = keccak256(initCode);

        // Compute CREATE2 address
        address expectedAddress = _computeCreate2Addr(salt, initCodeHash, CREATE2_DEPLOYER);

        console2.log("Configuration:");
        console2.log("  Permit2 Address:     ", PERMIT2);
        console2.log("  CREATE2 Deployer:    ", CREATE2_DEPLOYER);
        console2.log("  Deployment Salt:     ", vm.toString(salt));
        console2.log("  Init Code Hash:      ", vm.toString(initCodeHash));
        console2.log("");
        console2.log("------------------------------------------------------------");
        console2.log("  x402Permit2Proxy Address (all chains):");
        console2.log("  ", expectedAddress);
        console2.log("------------------------------------------------------------");
        console2.log("");

        // Check if deployed on current network (if we have RPC)
        if (block.chainid != 0) {
            console2.log("Current network: chainId", block.chainid);
            if (expectedAddress.code.length > 0) {
                console2.log("Status: DEPLOYED");

                // Try to read contract state
                x402Permit2Proxy proxy = x402Permit2Proxy(expectedAddress);
                try proxy.PERMIT2() returns (ISignatureTransfer permit2) {
                    console2.log("  PERMIT2:", address(permit2));
                } catch {
                    console2.log("  Warning: Could not read contract state");
                }
            } else {
                console2.log("Status: NOT DEPLOYED");
            }
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
}
