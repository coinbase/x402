// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {x402Permit2Proxy} from "../src/x402Permit2Proxy.sol";
import {ISignatureTransfer} from "../src/interfaces/IPermit2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/**
 * @title X402Permit2ProxyForkTest
 * @notice Fork tests against real Permit2 on Base Sepolia
 * @dev Run with: forge test --match-contract X402Permit2ProxyForkTest --fork-url $BASE_SEPOLIA_RPC_URL
 */
contract X402Permit2ProxyForkTest is Test {
    // Canonical Permit2 address (same on all EVM chains)
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // EIP-712 domain for Permit2
    bytes32 constant PERMIT2_DOMAIN_SEPARATOR_TYPEHASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");

    // PermitWitnessTransferFrom typehash
    bytes32 constant PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH = keccak256(
        "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,Witness witness)TokenPermissions(address token,uint256 amount)Witness(bytes extra,address to,uint256 validAfter,uint256 validBefore)"
    );

    bytes32 constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");

    x402Permit2Proxy public proxy;
    MockERC20 public token;

    uint256 public payerPrivateKey;
    address public payer;
    address public recipient;
    address public facilitator;

    uint256 public constant MINT_AMOUNT = 10_000e6;
    uint256 public constant TRANSFER_AMOUNT = 100e6;

    // Events
    event X402PermitTransfer(address indexed from, address indexed to, uint256 amount, address indexed asset);

    function setUp() public {
        // Skip if not forking
        if (block.chainid == 31_337) {
            // Local test network - skip fork tests
            return;
        }

        // Verify Permit2 exists
        require(PERMIT2.code.length > 0, "Permit2 not found on fork");

        // Set up accounts
        payerPrivateKey = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
        payer = vm.addr(payerPrivateKey);
        recipient = makeAddr("recipient");
        facilitator = makeAddr("facilitator");

        // Deploy proxy pointing to real Permit2
        proxy = new x402Permit2Proxy(PERMIT2);

        // Deploy test token
        token = new MockERC20("Test USDC", "TUSDC", 6);
        token.mint(payer, MINT_AMOUNT);

        // Payer approves Permit2
        vm.prank(payer);
        token.approve(PERMIT2, type(uint256).max);
    }

    modifier onlyFork() {
        if (block.chainid == 31_337) {
            return;
        }
        _;
    }

    // ============ Helper Functions ============

    function _computeDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(PERMIT2_DOMAIN_SEPARATOR_TYPEHASH, keccak256("Permit2"), block.chainid, PERMIT2));
    }

    function _signPermitWitnessTransfer(
        address tokenAddr,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        x402Permit2Proxy.Witness memory witness
    ) internal view returns (bytes memory) {
        // Compute witness hash
        bytes32 witnessHash = keccak256(
            abi.encode(
                proxy.WITNESS_TYPEHASH(), keccak256(witness.extra), witness.to, witness.validAfter, witness.validBefore
            )
        );

        // Compute token permissions hash
        bytes32 tokenPermissionsHash = keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, tokenAddr, amount));

        // Compute struct hash
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH,
                tokenPermissionsHash,
                address(proxy),
                nonce,
                deadline,
                witnessHash
            )
        );

        // Compute digest
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _computeDomainSeparator(), structHash));

        // Sign
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _generateNonce() internal view returns (uint256) {
        // Use a random-ish nonce based on block data
        uint256 wordPos = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao))) % 256;
        uint256 bitPos = uint256(keccak256(abi.encodePacked(block.number, msg.sender))) % 256;
        return (wordPos << 8) | bitPos;
    }

    // ============ Fork Tests ============

    function test_SettleWithRealPermit2() public onlyFork {
        uint256 currentTime = block.timestamp;
        uint256 nonce = _generateNonce();
        uint256 deadline = currentTime + 3600;

        x402Permit2Proxy.Witness memory witness = x402Permit2Proxy.Witness({
            to: recipient,
            validAfter: currentTime - 60,
            validBefore: currentTime + 3600,
            extra: ""
        });

        bytes memory signature = _signPermitWitnessTransfer(address(token), TRANSFER_AMOUNT, nonce, deadline, witness);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: TRANSFER_AMOUNT}),
            nonce: nonce,
            deadline: deadline
        });

        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        vm.expectEmit(true, true, true, true);
        emit X402PermitTransfer(payer, recipient, TRANSFER_AMOUNT, address(token));

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, signature);

        uint256 recipientBalanceAfter = token.balanceOf(recipient);
        assertEq(recipientBalanceAfter - recipientBalanceBefore, TRANSFER_AMOUNT);
    }

    function test_RejectInvalidSignature() public onlyFork {
        uint256 currentTime = block.timestamp;
        uint256 nonce = _generateNonce();
        uint256 deadline = currentTime + 3600;

        x402Permit2Proxy.Witness memory witness = x402Permit2Proxy.Witness({
            to: recipient,
            validAfter: currentTime - 60,
            validBefore: currentTime + 3600,
            extra: ""
        });

        // Invalid signature
        bytes memory invalidSignature = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: TRANSFER_AMOUNT}),
            nonce: nonce,
            deadline: deadline
        });

        vm.expectRevert();
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, invalidSignature);
    }

    function test_RejectWrongSigner() public onlyFork {
        uint256 currentTime = block.timestamp;
        uint256 nonce = _generateNonce();
        uint256 deadline = currentTime + 3600;

        x402Permit2Proxy.Witness memory witness = x402Permit2Proxy.Witness({
            to: recipient,
            validAfter: currentTime - 60,
            validBefore: currentTime + 3600,
            extra: ""
        });

        // Sign with different private key
        uint256 wrongPrivateKey = 0xdeadbeef;
        bytes32 witnessHash = keccak256(
            abi.encode(
                proxy.WITNESS_TYPEHASH(), keccak256(witness.extra), witness.to, witness.validAfter, witness.validBefore
            )
        );

        bytes32 tokenPermissionsHash =
            keccak256(abi.encode(TOKEN_PERMISSIONS_TYPEHASH, address(token), TRANSFER_AMOUNT));

        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH,
                tokenPermissionsHash,
                address(proxy),
                nonce,
                deadline,
                witnessHash
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _computeDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPrivateKey, digest);
        bytes memory wrongSignature = abi.encodePacked(r, s, v);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: TRANSFER_AMOUNT}),
            nonce: nonce,
            deadline: deadline
        });

        vm.expectRevert();
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, wrongSignature);
    }

    function test_RejectReplayedNonce() public onlyFork {
        uint256 currentTime = block.timestamp;
        uint256 nonce = _generateNonce();
        uint256 deadline = currentTime + 3600;

        x402Permit2Proxy.Witness memory witness = x402Permit2Proxy.Witness({
            to: recipient,
            validAfter: currentTime - 60,
            validBefore: currentTime + 3600,
            extra: ""
        });

        bytes memory signature = _signPermitWitnessTransfer(address(token), TRANSFER_AMOUNT, nonce, deadline, witness);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: TRANSFER_AMOUNT}),
            nonce: nonce,
            deadline: deadline
        });

        // First call succeeds
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, signature);

        // Second call with same nonce fails
        vm.expectRevert();
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, signature);
    }

    function test_RejectExpiredDeadline() public onlyFork {
        uint256 currentTime = block.timestamp;
        uint256 nonce = _generateNonce();
        uint256 deadline = currentTime - 60; // Already expired

        x402Permit2Proxy.Witness memory witness = x402Permit2Proxy.Witness({
            to: recipient,
            validAfter: currentTime - 120,
            validBefore: currentTime + 3600,
            extra: ""
        });

        bytes memory signature = _signPermitWitnessTransfer(address(token), TRANSFER_AMOUNT, nonce, deadline, witness);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: TRANSFER_AMOUNT}),
            nonce: nonce,
            deadline: deadline
        });

        vm.expectRevert();
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, signature);
    }

    function test_PartialAmountWithRealPermit2() public onlyFork {
        uint256 currentTime = block.timestamp;
        uint256 nonce = _generateNonce();
        uint256 deadline = currentTime + 3600;
        uint256 permittedAmount = 100e6;
        uint256 requestedAmount = 50e6;

        x402Permit2Proxy.Witness memory witness = x402Permit2Proxy.Witness({
            to: recipient,
            validAfter: currentTime - 60,
            validBefore: currentTime + 3600,
            extra: ""
        });

        bytes memory signature = _signPermitWitnessTransfer(address(token), permittedAmount, nonce, deadline, witness);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: permittedAmount}),
            nonce: nonce,
            deadline: deadline
        });

        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        vm.prank(facilitator);
        proxy.settle(permit, requestedAmount, payer, witness, signature);

        uint256 recipientBalanceAfter = token.balanceOf(recipient);
        assertEq(recipientBalanceAfter - recipientBalanceBefore, requestedAmount);
    }

    function test_PreventDestinationTampering() public onlyFork {
        uint256 currentTime = block.timestamp;
        uint256 nonce = _generateNonce();
        uint256 deadline = currentTime + 3600;

        // Sign with recipient as destination
        x402Permit2Proxy.Witness memory signedWitness = x402Permit2Proxy.Witness({
            to: recipient,
            validAfter: currentTime - 60,
            validBefore: currentTime + 3600,
            extra: ""
        });

        bytes memory signature =
            _signPermitWitnessTransfer(address(token), TRANSFER_AMOUNT, nonce, deadline, signedWitness);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: TRANSFER_AMOUNT}),
            nonce: nonce,
            deadline: deadline
        });

        // Try to redirect to facilitator
        x402Permit2Proxy.Witness memory tamperedWitness = x402Permit2Proxy.Witness({
            to: facilitator, // Tampered!
            validAfter: signedWitness.validAfter,
            validBefore: signedWitness.validBefore,
            extra: signedWitness.extra
        });

        // Should fail because witness hash doesn't match signature
        vm.expectRevert();
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, tamperedWitness, signature);
    }

    function test_MultipleSettlementsOnFork() public onlyFork {
        uint256 currentTime = block.timestamp;
        uint256 settlementAmount = 25e6;

        for (uint256 i = 0; i < 3; i++) {
            uint256 nonce = _generateNonce() + i * 1000; // Ensure different nonces
            uint256 deadline = currentTime + 3600;

            x402Permit2Proxy.Witness memory witness = x402Permit2Proxy.Witness({
                to: recipient,
                validAfter: currentTime - 60,
                validBefore: currentTime + 3600,
                extra: abi.encodePacked(i)
            });

            bytes memory signature =
                _signPermitWitnessTransfer(address(token), settlementAmount, nonce, deadline, witness);

            ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
                permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: settlementAmount}),
                nonce: nonce,
                deadline: deadline
            });

            vm.prank(facilitator);
            proxy.settle(permit, settlementAmount, payer, witness, signature);
        }

        assertEq(token.balanceOf(recipient), settlementAmount * 3);
    }
}
