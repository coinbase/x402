// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {x402Permit2Proxy} from "../../src/x402Permit2Proxy.sol";
import {ISignatureTransfer} from "../../src/interfaces/ISignatureTransfer.sol";
import {MockPermit2} from "../mocks/MockPermit2.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/**
 * @title X402Handler
 * @notice Handler contract for invariant testing
 */
contract X402Handler is Test {
    x402Permit2Proxy public proxy;
    MockPermit2 public mockPermit2;
    MockERC20 public token;

    address public payer;
    address public recipient;

    uint256 public totalSettled;
    uint256 public settleCount;
    uint256 public revertCount;

    constructor(
        x402Permit2Proxy _proxy,
        MockPermit2 _mockPermit2,
        MockERC20 _token,
        address _payer,
        address _recipient
    ) {
        proxy = _proxy;
        mockPermit2 = _mockPermit2;
        token = _token;
        payer = _payer;
        recipient = _recipient;
    }

    function settle(uint256 amount, uint256 nonceSeed, uint256 timeSeed) external {
        // Bound amount to reasonable range
        amount = bound(amount, 0, token.balanceOf(payer));
        if (amount == 0) return;

        // Generate nonce from seed
        uint256 nonce = nonceSeed % type(uint128).max;

        // Set up time window
        uint256 currentTime = block.timestamp;
        uint256 validAfter = currentTime > 60 ? currentTime - 60 : 0;
        uint256 validBefore = currentTime + 3600;

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: amount}),
            nonce: nonce,
            deadline: validBefore
        });

        x402Permit2Proxy.Witness memory witness =
            x402Permit2Proxy.Witness({to: recipient, validAfter: validAfter, validBefore: validBefore, extra: ""});

        bytes memory signature = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));

        try proxy.settle(permit, amount, payer, witness, signature) {
            totalSettled += amount;
            settleCount++;
        } catch {
            revertCount++;
        }
    }

    function settleInvalidTime(uint256 amount, uint256 nonce, bool tooEarly) external {
        amount = bound(amount, 1, token.balanceOf(payer));

        uint256 currentTime = block.timestamp;
        uint256 validAfter;
        uint256 validBefore;

        if (tooEarly) {
            validAfter = currentTime + 60; // In the future
            validBefore = currentTime + 3600;
        } else {
            validAfter = currentTime > 3600 ? currentTime - 3600 : 0;
            validBefore = currentTime > 60 ? currentTime - 60 : 0; // In the past
        }

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: amount}),
            nonce: nonce,
            deadline: currentTime + 3600
        });

        x402Permit2Proxy.Witness memory witness =
            x402Permit2Proxy.Witness({to: recipient, validAfter: validAfter, validBefore: validBefore, extra: ""});

        bytes memory signature = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));

        try proxy.settle(permit, amount, payer, witness, signature) {
            // This should not succeed
            revert("Should have reverted");
        } catch {
            revertCount++;
        }
    }
}

/**
 * @title X402InvariantsTest
 * @notice Invariant tests for x402Permit2Proxy
 */
contract X402InvariantsTest is Test {
    x402Permit2Proxy public proxy;
    MockPermit2 public mockPermit2;
    MockERC20 public token;
    X402Handler public handler;

    address public payer;
    address public recipient;

    uint256 public constant MINT_AMOUNT = 1_000_000e6;

    function setUp() public {
        payer = makeAddr("payer");
        recipient = makeAddr("recipient");

        // Deploy contracts
        mockPermit2 = new MockPermit2();
        proxy = new x402Permit2Proxy(address(mockPermit2));
        token = new MockERC20("Test USDC", "USDC", 6);

        // Set up payer
        token.mint(payer, MINT_AMOUNT);
        vm.prank(payer);
        token.approve(address(mockPermit2), type(uint256).max);
        mockPermit2.setShouldActuallyTransfer(true);

        // Deploy handler
        handler = new X402Handler(proxy, mockPermit2, token, payer, recipient);

        // Target the handler
        targetContract(address(handler));
    }

    // ============ Invariants ============

    /// @notice The proxy contract should never hold any tokens
    function invariant_proxyNeverHoldsTokens() public view {
        assertEq(token.balanceOf(address(proxy)), 0, "Proxy should never hold tokens");
    }

    /// @notice The PERMIT2 address should never change
    function invariant_permit2AddressNeverChanges() public view {
        assertEq(address(proxy.PERMIT2()), address(mockPermit2), "PERMIT2 address should never change");
    }

    /// @notice Total settled should never exceed total minted
    function invariant_settledNeverExceedsMinted() public view {
        assertLe(handler.totalSettled(), MINT_AMOUNT, "Settled should never exceed minted");
    }

    /// @notice Conservation of tokens: payer balance + recipient balance should equal mint amount
    function invariant_tokenConservation() public view {
        uint256 payerBalance = token.balanceOf(payer);
        uint256 recipientBalance = token.balanceOf(recipient);
        uint256 proxyBalance = token.balanceOf(address(proxy));
        uint256 mockPermit2Balance = token.balanceOf(address(mockPermit2));

        assertEq(
            payerBalance + recipientBalance + proxyBalance + mockPermit2Balance,
            MINT_AMOUNT,
            "Token conservation violated"
        );
    }

    /// @notice WITNESS_TYPEHASH should be constant
    function invariant_witnessTypehashConstant() public view {
        bytes32 expected = keccak256("Witness(address to,uint256 validAfter,uint256 validBefore,bytes extra)");
        assertEq(proxy.WITNESS_TYPEHASH(), expected, "WITNESS_TYPEHASH should be constant");
    }

    /// @notice WITNESS_TYPE_STRING should be constant
    function invariant_witnessTypeStringConstant() public view {
        string memory expected =
            "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,uint256 validAfter,uint256 validBefore,bytes extra)";
        assertEq(
            keccak256(bytes(proxy.WITNESS_TYPE_STRING())),
            keccak256(bytes(expected)),
            "WITNESS_TYPE_STRING should be constant"
        );
    }

    // ============ Summary ============

    function invariant_callSummary() public view {
        console2.log("Settle count:", handler.settleCount());
        console2.log("Revert count:", handler.revertCount());
        console2.log("Total settled:", handler.totalSettled());
    }
}
