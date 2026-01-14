// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {x402Permit2Proxy} from "../src/x402Permit2Proxy.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";

/**
 * @title DeployX402Proxy
 * @notice Deployment script for x402Permit2Proxy using CREATE2
 * @dev Run with: forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
 */
contract DeployX402Proxy is Script {
    /// @notice Canonical Permit2 address (same on all EVM chains)
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Arachnid's deterministic CREATE2 deployer (same on all EVM chains)
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @notice Salt for deterministic deployment
    /// @dev Derived from: "x402-x402permit2proxy-v95348"
    /// @dev Produces address: 0x40203F636c4EDFaFc36933837FFB411e1c031B50
    bytes32 constant SALT = 0x62bb59fa735c572ac45816aa0f1e00b2de3c4671993a9147999a3808c574240e;

    /// @notice Expected deployment address (vanity address starting with 0x4020)
    address constant EXPECTED_ADDRESS = 0x40203F636c4EDFaFc36933837FFB411e1c031B50;

    function run() public {
        console2.log("");
        console2.log("============================================================");
        console2.log("  x402Permit2Proxy Deterministic Deployment (CREATE2)");
        console2.log("============================================================");
        console2.log("");

        // Log configuration
        console2.log("Network: chainId", block.chainid);
        console2.log("Permit2:", PERMIT2);
        console2.log("CREATE2 Deployer:", CREATE2_DEPLOYER);
        console2.log("Salt:", vm.toString(SALT));
        console2.log("");

        // Verify Permit2 exists (skip for local networks)
        if (block.chainid != 31_337 && block.chainid != 1337) {
            require(PERMIT2.code.length > 0, "Permit2 not found on this network");
            console2.log("Permit2 verified");

            require(CREATE2_DEPLOYER.code.length > 0, "CREATE2 deployer not found on this network");
            console2.log("CREATE2 deployer verified");
        }

        // Compute expected address
        bytes memory initCode = abi.encodePacked(type(x402Permit2Proxy).creationCode, abi.encode(PERMIT2));
        bytes32 initCodeHash = keccak256(initCode);
        address expectedAddress = _computeCreate2Addr(SALT, initCodeHash, CREATE2_DEPLOYER);

        console2.log("");
        console2.log("Expected address:", expectedAddress);
        console2.log("Init code hash:", vm.toString(initCodeHash));

        // Check if already deployed
        if (expectedAddress.code.length > 0) {
            console2.log("");
            console2.log("Contract already deployed at", expectedAddress);
            console2.log("Skipping deployment.");

            // Verify it's the correct contract
            x402Permit2Proxy existingProxy = x402Permit2Proxy(expectedAddress);
            console2.log("PERMIT2:", address(existingProxy.PERMIT2()));
            return;
        }

        // Deploy
        console2.log("");
        console2.log("Deploying x402Permit2Proxy...");

        vm.startBroadcast();

        address deployedAddress;

        if (block.chainid == 31_337 || block.chainid == 1337) {
            // For local networks, use regular deployment
            console2.log("(Using regular deployment for local network)");
            x402Permit2Proxy newProxy = new x402Permit2Proxy(PERMIT2);
            deployedAddress = address(newProxy);
        } else {
            // Use CREATE2 for deterministic deployment
            bytes memory deploymentData = abi.encodePacked(SALT, initCode);

            (bool success,) = CREATE2_DEPLOYER.call(deploymentData);
            require(success, "CREATE2 deployment failed");

            deployedAddress = expectedAddress;

            // Verify deployment
            require(deployedAddress.code.length > 0, "No bytecode at expected address");
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("Deployed to:", deployedAddress);

        // Verify the contract
        x402Permit2Proxy proxy = x402Permit2Proxy(deployedAddress);
        console2.log("");
        console2.log("Verification:");
        console2.log("  PERMIT2:", address(proxy.PERMIT2()));
        console2.log("  WITNESS_TYPEHASH:", vm.toString(proxy.WITNESS_TYPEHASH()));

        require(address(proxy.PERMIT2()) == PERMIT2, "PERMIT2 mismatch");

        console2.log("");
        console2.log("Deployment successful!");
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
