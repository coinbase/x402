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
 */
contract DeployX402Proxies is Script {
    /// @notice Canonical Permit2 address (same on all EVM chains)
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @notice Arachnid's deterministic CREATE2 deployer (same on all EVM chains)
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    /// @notice Salt for x402ExactPermit2Proxy deterministic deployment
    /// @dev Vanity mined for address 0x4020...0001
    bytes32 constant EXACT_SALT = 0x000000000000000000000000000000000000000000000000e80000001d1e4dc7;

    /// @notice Salt for x402UptoPermit2Proxy deterministic deployment
    /// @dev Vanity mined for address 0x4020...0002
    bytes32 constant UPTO_SALT = 0x000000000000000000000000000000000000000000000000900000000ef65bb4;

    function run() public {
        console2.log("");
        console2.log("============================================================");
        console2.log("  x402 Permit2 Proxies Deterministic Deployment (CREATE2)");
        console2.log("============================================================");
        console2.log("");

        // Log configuration
        console2.log("Network: chainId", block.chainid);
        console2.log("Permit2:", PERMIT2);
        console2.log("CREATE2 Deployer:", CREATE2_DEPLOYER);
        console2.log("");

        // Verify Permit2 exists (skip for local networks)
        if (block.chainid != 31_337 && block.chainid != 1337) {
            require(PERMIT2.code.length > 0, "Permit2 not found on this network");
            console2.log("Permit2 verified");

            require(CREATE2_DEPLOYER.code.length > 0, "CREATE2 deployer not found on this network");
            console2.log("CREATE2 deployer verified");
        }

        // Deploy both contracts
        _deployExact();
        _deployUpto();

        console2.log("");
        console2.log("All deployments complete!");
        console2.log("");
    }

    function _deployExact() internal {
        console2.log("");
        console2.log("------------------------------------------------------------");
        console2.log("  Deploying x402ExactPermit2Proxy");
        console2.log("------------------------------------------------------------");

        bytes memory initCode = abi.encodePacked(type(x402ExactPermit2Proxy).creationCode, abi.encode(PERMIT2));
        bytes32 initCodeHash = keccak256(initCode);
        address expectedAddress = _computeCreate2Addr(EXACT_SALT, initCodeHash, CREATE2_DEPLOYER);

        console2.log("Salt:", vm.toString(EXACT_SALT));
        console2.log("Expected address:", expectedAddress);
        console2.log("Init code hash:", vm.toString(initCodeHash));

        if (expectedAddress.code.length > 0) {
            console2.log("Contract already deployed at", expectedAddress);
            x402ExactPermit2Proxy existingProxy = x402ExactPermit2Proxy(expectedAddress);
            console2.log("PERMIT2:", address(existingProxy.PERMIT2()));
            return;
        }

        vm.startBroadcast();

        address deployedAddress;
        if (block.chainid == 31_337 || block.chainid == 1337) {
            console2.log("(Using regular deployment for local network)");
            x402ExactPermit2Proxy newProxy = new x402ExactPermit2Proxy(PERMIT2);
            deployedAddress = address(newProxy);
        } else {
            bytes memory deploymentData = abi.encodePacked(EXACT_SALT, initCode);
            (bool success,) = CREATE2_DEPLOYER.call(deploymentData);
            require(success, "CREATE2 deployment failed for Exact");
            deployedAddress = expectedAddress;
            require(deployedAddress.code.length > 0, "No bytecode at expected address");
        }

        vm.stopBroadcast();

        console2.log("Deployed to:", deployedAddress);

        x402ExactPermit2Proxy proxy = x402ExactPermit2Proxy(deployedAddress);
        console2.log("Verification - PERMIT2:", address(proxy.PERMIT2()));
        require(address(proxy.PERMIT2()) == PERMIT2, "PERMIT2 mismatch");
    }

    function _deployUpto() internal {
        console2.log("");
        console2.log("------------------------------------------------------------");
        console2.log("  Deploying x402UptoPermit2Proxy");
        console2.log("------------------------------------------------------------");

        bytes memory initCode = abi.encodePacked(type(x402UptoPermit2Proxy).creationCode, abi.encode(PERMIT2));
        bytes32 initCodeHash = keccak256(initCode);
        address expectedAddress = _computeCreate2Addr(UPTO_SALT, initCodeHash, CREATE2_DEPLOYER);

        console2.log("Salt:", vm.toString(UPTO_SALT));
        console2.log("Expected address:", expectedAddress);
        console2.log("Init code hash:", vm.toString(initCodeHash));

        if (expectedAddress.code.length > 0) {
            console2.log("Contract already deployed at", expectedAddress);
            x402UptoPermit2Proxy existingProxy = x402UptoPermit2Proxy(expectedAddress);
            console2.log("PERMIT2:", address(existingProxy.PERMIT2()));
            return;
        }

        vm.startBroadcast();

        address deployedAddress;
        if (block.chainid == 31_337 || block.chainid == 1337) {
            console2.log("(Using regular deployment for local network)");
            x402UptoPermit2Proxy newProxy = new x402UptoPermit2Proxy(PERMIT2);
            deployedAddress = address(newProxy);
        } else {
            bytes memory deploymentData = abi.encodePacked(UPTO_SALT, initCode);
            (bool success,) = CREATE2_DEPLOYER.call(deploymentData);
            require(success, "CREATE2 deployment failed for Upto");
            deployedAddress = expectedAddress;
            require(deployedAddress.code.length > 0, "No bytecode at expected address");
        }

        vm.stopBroadcast();

        console2.log("Deployed to:", deployedAddress);

        x402UptoPermit2Proxy proxy = x402UptoPermit2Proxy(deployedAddress);
        console2.log("Verification - PERMIT2:", address(proxy.PERMIT2()));
        require(address(proxy.PERMIT2()) == PERMIT2, "PERMIT2 mismatch");
    }

    function _computeCreate2Addr(
        bytes32 salt,
        bytes32 initCodeHash,
        address deployer
    ) internal pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
    }
}
