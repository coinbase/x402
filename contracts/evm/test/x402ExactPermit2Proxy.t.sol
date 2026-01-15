// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {x402ExactPermit2Proxy} from "../src/x402ExactPermit2Proxy.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC20Permit} from "./mocks/MockERC20Permit.sol";
import {MaliciousReentrantExact} from "./mocks/MaliciousReentrantExact.sol";

contract X402ExactPermit2ProxyTest is Test {
    x402ExactPermit2Proxy public proxy;
    MockPermit2 public mockPermit2;
    MockERC20 public token;

    address public payer;
    address public recipient;

    uint256 constant MINT_AMOUNT = 10_000e6;
    uint256 constant TRANSFER_AMOUNT = 100e6;

    event Settled();
    event SettledWith2612();

    function setUp() public {
        vm.warp(1_000_000);

        payer = makeAddr("payer");
        recipient = makeAddr("recipient");

        mockPermit2 = new MockPermit2();
        proxy = new x402ExactPermit2Proxy(address(mockPermit2));
        token = new MockERC20("USDC", "USDC", 6);

        token.mint(payer, MINT_AMOUNT);
        vm.prank(payer);
        token.approve(address(mockPermit2), type(uint256).max);
        mockPermit2.setShouldActuallyTransfer(true);
    }

    function _permit(
        uint256 amount,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (ISignatureTransfer.PermitTransferFrom memory) {
        return ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: amount}),
            nonce: nonce,
            deadline: deadline
        });
    }

    function _witness(
        address to,
        uint256 validAfter,
        uint256 validBefore
    ) internal pure returns (x402ExactPermit2Proxy.Witness memory) {
        return x402ExactPermit2Proxy.Witness({to: to, validAfter: validAfter, validBefore: validBefore, extra: ""});
    }

    function _sig() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
    }

    // --- Constructor ---

    function test_constructor_revertsOnZeroPermit2() public {
        vm.expectRevert(x402ExactPermit2Proxy.InvalidPermit2Address.selector);
        new x402ExactPermit2Proxy(address(0));
    }

    function test_constructor_setsPermit2() public view {
        assertEq(address(proxy.PERMIT2()), address(mockPermit2));
    }

    // --- settle() validation ---

    function test_settle_revertsOnZeroOwner() public {
        uint256 t = block.timestamp;
        vm.expectRevert(x402ExactPermit2Proxy.InvalidOwner.selector);
        proxy.settle(_permit(TRANSFER_AMOUNT, 0, t + 3600), address(0), _witness(recipient, t - 60, t + 3600), _sig());
    }

    function test_settle_revertsOnZeroDestination() public {
        uint256 t = block.timestamp;
        vm.expectRevert(x402ExactPermit2Proxy.InvalidDestination.selector);
        proxy.settle(_permit(TRANSFER_AMOUNT, 0, t + 3600), payer, _witness(address(0), t - 60, t + 3600), _sig());
    }

    function test_settle_revertsBeforeValidAfter() public {
        uint256 t = block.timestamp;
        vm.expectRevert(x402ExactPermit2Proxy.PaymentTooEarly.selector);
        proxy.settle(_permit(TRANSFER_AMOUNT, 0, t + 3600), payer, _witness(recipient, t + 60, t + 3600), _sig());
    }

    function test_settle_revertsAfterValidBefore() public {
        uint256 t = block.timestamp;
        vm.expectRevert(x402ExactPermit2Proxy.PaymentExpired.selector);
        proxy.settle(_permit(TRANSFER_AMOUNT, 0, t + 3600), payer, _witness(recipient, t - 120, t - 60), _sig());
    }

    // --- settle() success paths ---

    function test_settle_transfersExactPermittedAmount() public {
        uint256 t = block.timestamp;
        uint256 balanceBefore = token.balanceOf(recipient);

        proxy.settle(_permit(TRANSFER_AMOUNT, 0, t + 3600), payer, _witness(recipient, t - 60, t + 3600), _sig());

        assertEq(token.balanceOf(recipient) - balanceBefore, TRANSFER_AMOUNT);
    }

    function test_settle_emitsSettled() public {
        uint256 t = block.timestamp;

        vm.expectEmit(false, false, false, false);
        emit Settled();

        proxy.settle(_permit(TRANSFER_AMOUNT, 0, t + 3600), payer, _witness(recipient, t - 60, t + 3600), _sig());
    }

    function test_settle_atExactValidAfter() public {
        uint256 t = block.timestamp;
        proxy.settle(_permit(TRANSFER_AMOUNT, 0, t + 3600), payer, _witness(recipient, t, t + 3600), _sig());
        assertEq(token.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    function test_settle_atExactValidBefore() public {
        uint256 t = block.timestamp;
        proxy.settle(_permit(TRANSFER_AMOUNT, 0, t + 3600), payer, _witness(recipient, t - 60, t), _sig());
        assertEq(token.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    // --- Security: Reentrancy ---

    function test_settle_blocksReentrancy() public {
        MaliciousReentrantExact maliciousPermit2 = new MaliciousReentrantExact();
        x402ExactPermit2Proxy vulnerableProxy = new x402ExactPermit2Proxy(address(maliciousPermit2));
        maliciousPermit2.setTarget(address(vulnerableProxy));

        MockERC20 testToken = new MockERC20("Test", "TST", 6);
        testToken.mint(payer, MINT_AMOUNT);
        vm.prank(payer);
        testToken.approve(address(maliciousPermit2), type(uint256).max);

        uint256 t = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(testToken), amount: TRANSFER_AMOUNT}),
            nonce: 0,
            deadline: t + 3600
        });
        x402ExactPermit2Proxy.Witness memory witness = _witness(recipient, t - 60, t + 3600);

        maliciousPermit2.setAttemptReentry(true);
        maliciousPermit2.setAttackParams(permit, payer, witness, _sig());

        vm.expectRevert();
        vulnerableProxy.settle(permit, payer, witness, _sig());
    }

    // --- Security: Proxy never holds funds ---

    function test_settle_proxyNeverHoldsTokens() public {
        uint256 t = block.timestamp;
        proxy.settle(_permit(TRANSFER_AMOUNT, 0, t + 3600), payer, _witness(recipient, t - 60, t + 3600), _sig());
        assertEq(token.balanceOf(address(proxy)), 0);
    }

    // --- settleWith2612() ---

    function test_settleWith2612_transfersTokens() public {
        MockERC20Permit permitToken = new MockERC20Permit("USDC", "USDC", 6);
        permitToken.mint(payer, MINT_AMOUNT);
        vm.prank(payer);
        permitToken.approve(address(mockPermit2), type(uint256).max);

        uint256 t = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: TRANSFER_AMOUNT}),
            nonce: 0,
            deadline: t + 3600
        });

        x402ExactPermit2Proxy.EIP2612Permit memory permit2612 = x402ExactPermit2Proxy.EIP2612Permit({
            value: type(uint256).max,
            deadline: t + 3600,
            v: 27,
            r: bytes32(uint256(1)),
            s: bytes32(uint256(2))
        });

        vm.expectEmit(false, false, false, false);
        emit SettledWith2612();

        proxy.settleWith2612(permit2612, permit, payer, _witness(recipient, t - 60, t + 3600), _sig());

        assertEq(permitToken.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    function test_settleWith2612_succeedsWhenPermitFails() public {
        MockERC20Permit permitToken = new MockERC20Permit("USDC", "USDC", 6);
        permitToken.mint(payer, MINT_AMOUNT);
        permitToken.setPermitRevert(true, "Permit failed");

        vm.prank(payer);
        permitToken.approve(address(mockPermit2), type(uint256).max);

        uint256 t = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: TRANSFER_AMOUNT}),
            nonce: 0,
            deadline: t + 3600
        });

        x402ExactPermit2Proxy.EIP2612Permit memory permit2612 = x402ExactPermit2Proxy.EIP2612Permit({
            value: type(uint256).max,
            deadline: t + 3600,
            v: 27,
            r: bytes32(uint256(1)),
            s: bytes32(uint256(2))
        });

        proxy.settleWith2612(permit2612, permit, payer, _witness(recipient, t - 60, t + 3600), _sig());

        assertEq(permitToken.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    // --- Fuzz: Time window ---

    function testFuzz_settle_withinTimeWindow(uint256 validAfter, uint256 validBefore, uint256 currentTime) public {
        validAfter = bound(validAfter, 0, type(uint64).max - 1);
        validBefore = bound(validBefore, validAfter + 1, type(uint64).max);
        currentTime = bound(currentTime, validAfter, validBefore);

        vm.warp(currentTime);

        proxy.settle(
            _permit(TRANSFER_AMOUNT, 0, currentTime + 3600), payer, _witness(recipient, validAfter, validBefore), _sig()
        );

        assertEq(token.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    function testFuzz_settle_revertsOutsideTimeWindow(
        uint256 validAfter,
        uint256 validBefore,
        uint256 currentTime
    ) public {
        validAfter = bound(validAfter, 1000, type(uint64).max - 1000);
        validBefore = bound(validBefore, validAfter + 1, type(uint64).max - 1);

        // Force currentTime outside the valid window
        if (currentTime % 2 == 0) {
            currentTime = bound(currentTime, 0, validAfter - 1);
        } else {
            currentTime = bound(currentTime, validBefore + 1, type(uint64).max);
        }

        vm.warp(currentTime);

        vm.expectRevert();
        proxy.settle(
            _permit(TRANSFER_AMOUNT, 0, currentTime + 3600), payer, _witness(recipient, validAfter, validBefore), _sig()
        );
    }

    // --- Fuzz: Amount (exact always transfers full permitted amount) ---

    function testFuzz_settle_alwaysTransfersExactPermittedAmount(
        uint256 permitted
    ) public {
        permitted = bound(permitted, 1, MINT_AMOUNT);

        uint256 t = block.timestamp;

        proxy.settle(_permit(permitted, 0, t + 3600), payer, _witness(recipient, t - 60, t + 3600), _sig());

        assertEq(token.balanceOf(recipient), permitted);
    }
}
