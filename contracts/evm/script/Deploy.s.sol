// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {x402ExactPermit2Proxy} from "../src/x402ExactPermit2Proxy.sol";
import {x402UptoPermit2Proxy} from "../src/x402UptoPermit2Proxy.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";

/**
 * @title DeployX402Proxies
 * @notice Deployment script for x402 Permit2 Proxy contracts using CREATE2
 * @dev Run with: forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
 *
 *      The contracts use an initializer pattern to ensure the same CREATE2 address
 *      across all chains, regardless of the chain's Permit2 address.
 */
contract DeployX402Proxies is Script {
    /// @notice Canonical Permit2 address (Uniswap's official deployment)
    /// @dev Override via environment variable PERMIT2_ADDRESS for chains with different Permit2
    address constant CANONICAL_PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Arachnid's deterministic CREATE2 deployer (same on all EVM chains)
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @notice Salt for x402ExactPermit2Proxy deterministic deployment
    /// @dev Vanity mined for address 0x4020615294c913f045dc10f0a5cdebd86c280001
    bytes32 constant EXACT_SALT = 0x000000000000000000000000000000000000000000000000600000000cc912d1;

    /// @notice Salt for x402UptoPermit2Proxy deterministic deployment
    /// @dev Vanity mined for address 0x4020633461b2895a48930ff97ee8fcde8e520002
    bytes32 constant UPTO_SALT = 0x0000000000000000000000000000000000000000000000006000000009a82260;

    function run() public {
        // Allow override of Permit2 address for chains with non-canonical deployments
        address permit2 = vm.envOr("PERMIT2_ADDRESS", CANONICAL_PERMIT2);

        console2.log("");
        console2.log("============================================================");
        console2.log("  x402 Permit2 Proxies Deterministic Deployment (CREATE2)");
        console2.log("============================================================");
        console2.log("");

        // Log configuration
        console2.log("Network: chainId", block.chainid);
        console2.log("Permit2:", permit2);
        console2.log("CREATE2 Deployer:", CREATE2_DEPLOYER);
        console2.log("");

        // Verify Permit2 exists (skip for local networks)
        if (block.chainid != 31_337 && block.chainid != 1337) {
            require(permit2.code.length > 0, "Permit2 not found on this network");
            console2.log("Permit2 verified");

            require(CREATE2_DEPLOYER.code.length > 0, "CREATE2 deployer not found on this network");
            console2.log("CREATE2 deployer verified");
        }

        // Deploy and initialize both contracts
        _deployExact(permit2);
        _deployUpto(permit2);

        console2.log("");
        console2.log("All deployments complete!");
        console2.log("");
    }

    function _deployExact(
        address permit2
    ) internal {
        console2.log("");
        console2.log("------------------------------------------------------------");
        console2.log("  Deploying x402ExactPermit2Proxy");
        console2.log("------------------------------------------------------------");

        // No constructor args - enables same address on all chains
        bytes memory initCode = type(x402ExactPermit2Proxy).creationCode;
        bytes32 initCodeHash = keccak256(initCode);
        address expectedAddress = _computeCreate2Addr(EXACT_SALT, initCodeHash, CREATE2_DEPLOYER);

        console2.log("Salt:", vm.toString(EXACT_SALT));
        console2.log("Expected address:", expectedAddress);
        console2.log("Init code hash:", vm.toString(initCodeHash));

        x402ExactPermit2Proxy proxy;

        if (expectedAddress.code.length > 0) {
            console2.log("Contract already deployed at", expectedAddress);
            proxy = x402ExactPermit2Proxy(expectedAddress);
            console2.log("PERMIT2:", address(proxy.permit2()));
            return;
        }

        vm.startBroadcast();

        address deployedAddress;
        if (block.chainid == 31_337 || block.chainid == 1337) {
            console2.log("(Using regular deployment for local network)");
            proxy = new x402ExactPermit2Proxy();
            deployedAddress = address(proxy);
        } else {
            bytes memory deploymentData = abi.encodePacked(EXACT_SALT, initCode);
            (bool success,) = CREATE2_DEPLOYER.call(deploymentData);
            require(success, "CREATE2 deployment failed for Exact");
            deployedAddress = expectedAddress;
            require(deployedAddress.code.length > 0, "No bytecode at expected address");
            proxy = x402ExactPermit2Proxy(deployedAddress);
        }

        // Initialize with chain-specific Permit2 address
        console2.log("Initializing with Permit2:", permit2);
        proxy.initialize(permit2);

        vm.stopBroadcast();

        console2.log("Deployed to:", deployedAddress);
        console2.log("Verification - PERMIT2:", address(proxy.permit2()));
        require(address(proxy.permit2()) == permit2, "PERMIT2 mismatch");
    }

    function _deployUpto(
        address permit2
    ) internal {
        console2.log("");
        console2.log("------------------------------------------------------------");
        console2.log("  Deploying x402UptoPermit2Proxy");
        console2.log("------------------------------------------------------------");

        // No constructor args - enables same address on all chains
        bytes memory initCode = type(x402UptoPermit2Proxy).creationCode;
        bytes32 initCodeHash = keccak256(initCode);
        address expectedAddress = _computeCreate2Addr(UPTO_SALT, initCodeHash, CREATE2_DEPLOYER);

        console2.log("Salt:", vm.toString(UPTO_SALT));
        console2.log("Expected address:", expectedAddress);
        console2.log("Init code hash:", vm.toString(initCodeHash));

        x402UptoPermit2Proxy proxy;

        if (expectedAddress.code.length > 0) {
            console2.log("Contract already deployed at", expectedAddress);
            proxy = x402UptoPermit2Proxy(expectedAddress);
            console2.log("PERMIT2:", address(proxy.permit2()));
            return;
        }

        vm.startBroadcast();

        address deployedAddress;
        if (block.chainid == 31_337 || block.chainid == 1337) {
            console2.log("(Using regular deployment for local network)");
            proxy = new x402UptoPermit2Proxy();
            deployedAddress = address(proxy);
        } else {
            bytes memory deploymentData = abi.encodePacked(UPTO_SALT, initCode);
            (bool success,) = CREATE2_DEPLOYER.call(deploymentData);
            require(success, "CREATE2 deployment failed for Upto");
            deployedAddress = expectedAddress;
            require(deployedAddress.code.length > 0, "No bytecode at expected address");
            proxy = x402UptoPermit2Proxy(deployedAddress);
        }

        // Initialize with chain-specific Permit2 address
        console2.log("Initializing with Permit2:", permit2);
        proxy.initialize(permit2);

        vm.stopBroadcast();

        console2.log("Deployed to:", deployedAddress);
        console2.log("Verification - PERMIT2:", address(proxy.permit2()));
        require(address(proxy.permit2()) == permit2, "PERMIT2 mismatch");
    }

    function _computeCreate2Addr(
        bytes32 salt,
        bytes32 initCodeHash,
        address deployer
    ) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }
}
