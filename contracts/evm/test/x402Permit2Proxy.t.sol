// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {x402Permit2Proxy} from "../src/x402Permit2Proxy.sol";
import {ISignatureTransfer} from "../src/interfaces/IPermit2.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC20Permit} from "./mocks/MockERC20Permit.sol";
import {MaliciousReentrant} from "./mocks/MaliciousReentrant.sol";

/**
 * @title X402Permit2ProxyTest
 * @notice Comprehensive unit tests for x402Permit2Proxy
 */
contract X402Permit2ProxyTest is Test {
    x402Permit2Proxy public proxy;
    MockPermit2 public mockPermit2;
    MockERC20 public token;

    address public deployer;
    address public facilitator;
    address public payer;
    address public recipient;
    address public malicious;

    uint256 public constant MINT_AMOUNT = 10_000e6; // 10,000 USDC
    uint256 public constant TRANSFER_AMOUNT = 100e6; // 100 USDC

    // Events
    event X402PermitTransfer(address indexed from, address indexed to, uint256 amount, address indexed asset);

    function setUp() public {
        // Warp to a reasonable timestamp to avoid underflow in time calculations
        vm.warp(1_000_000);

        deployer = makeAddr("deployer");
        facilitator = makeAddr("facilitator");
        payer = makeAddr("payer");
        recipient = makeAddr("recipient");
        malicious = makeAddr("malicious");

        // Deploy mock Permit2
        mockPermit2 = new MockPermit2();

        // Deploy proxy
        proxy = new x402Permit2Proxy(address(mockPermit2));

        // Deploy mock token
        token = new MockERC20("Test USDC", "USDC", 6);

        // Mint tokens to payer
        token.mint(payer, MINT_AMOUNT);

        // Approve mockPermit2 to spend tokens
        vm.prank(payer);
        token.approve(address(mockPermit2), type(uint256).max);

        // Configure mockPermit2 to actually transfer tokens
        mockPermit2.setShouldActuallyTransfer(true);
    }

    // ============ Helper Functions ============

    function _createPermit(
        address tokenAddr,
        uint256 amount,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (ISignatureTransfer.PermitTransferFrom memory) {
        return ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: tokenAddr, amount: amount}),
            nonce: nonce,
            deadline: deadline
        });
    }

    function _createWitness(
        address to,
        uint256 validAfter,
        uint256 validBefore,
        bytes memory extra
    ) internal pure returns (x402Permit2Proxy.Witness memory) {
        return x402Permit2Proxy.Witness({to: to, validAfter: validAfter, validBefore: validBefore, extra: extra});
    }

    function _dummySignature() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
    }

    // ============ Deployment Tests ============

    function test_DeploysWithCorrectPermit2Address() public view {
        assertEq(address(proxy.PERMIT2()), address(mockPermit2));
    }

    function test_RevertWhenZeroPermit2Address() public {
        vm.expectRevert(x402Permit2Proxy.InvalidPermit2Address.selector);
        new x402Permit2Proxy(address(0));
    }

    function test_WitnessTypeStringIsCorrect() public view {
        string memory expected =
            "Witness witness)TokenPermissions(address token,uint256 amount)Witness(bytes extra,address to,uint256 validAfter,uint256 validBefore)";
        assertEq(proxy.WITNESS_TYPE_STRING(), expected);
    }

    function test_WitnessTypehashIsCorrect() public view {
        bytes32 expected = keccak256("Witness(bytes extra,address to,uint256 validAfter,uint256 validBefore)");
        assertEq(proxy.WITNESS_TYPEHASH(), expected);
    }

    // ============ settle() - Happy Path Tests ============

    function test_SettleTransfersTokensSuccessfully() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        uint256 recipientBalanceAfter = token.balanceOf(recipient);
        assertEq(recipientBalanceAfter - recipientBalanceBefore, TRANSFER_AMOUNT);
    }

    function test_SettleEmitsEvent() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        vm.expectEmit(true, true, true, true);
        emit X402PermitTransfer(payer, recipient, TRANSFER_AMOUNT, address(token));

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());
    }

    function test_SettleWithPartialAmount() public {
        uint256 currentTime = block.timestamp;
        uint256 permittedAmount = 100e6;
        uint256 requestedAmount = 50e6; // Less than permitted

        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), permittedAmount, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        uint256 recipientBalanceBefore = token.balanceOf(recipient);

        vm.prank(facilitator);
        proxy.settle(permit, requestedAmount, payer, witness, _dummySignature());

        uint256 recipientBalanceAfter = token.balanceOf(recipient);
        assertEq(recipientBalanceAfter - recipientBalanceBefore, requestedAmount);
    }

    function test_SettleAnyoneCanCall() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        // Random address can call settle
        address randomCaller = makeAddr("randomCaller");
        vm.prank(randomCaller);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        assertEq(token.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    // ============ settle() - Time Validation Tests ============

    function test_RevertWhenPaymentTooEarly() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        // validAfter is in the future
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime + 60, currentTime + 3600, "");

        vm.expectRevert(x402Permit2Proxy.PaymentTooEarly.selector);
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());
    }

    function test_RevertWhenPaymentExpired() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        // validBefore is in the past
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 120, currentTime - 60, "");

        vm.expectRevert(x402Permit2Proxy.PaymentExpired.selector);
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());
    }

    function test_SettleAtExactValidAfterTime() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        // validAfter is exactly now
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime, currentTime + 3600, "");

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        assertEq(token.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    function test_SettleAtExactValidBeforeTime() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        // validBefore is exactly now
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime, "");

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        assertEq(token.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    // ============ settle() - Amount Validation Tests ============

    function test_RevertWhenAmountExceedsPermitted() public {
        uint256 currentTime = block.timestamp;
        uint256 permittedAmount = 100e6;
        uint256 requestedAmount = 150e6; // More than permitted

        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), permittedAmount, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        vm.expectRevert(x402Permit2Proxy.AmountExceedsPermitted.selector);
        vm.prank(facilitator);
        proxy.settle(permit, requestedAmount, payer, witness, _dummySignature());
    }

    function test_SettleWithZeroAmount() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        vm.prank(facilitator);
        proxy.settle(permit, 0, payer, witness, _dummySignature());

        // No tokens should have been transferred
        assertEq(token.balanceOf(recipient), 0);
    }

    // ============ settle() - Address Validation Tests ============

    function test_RevertWhenOwnerIsZeroAddress() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        vm.expectRevert(x402Permit2Proxy.InvalidOwner.selector);
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, address(0), witness, _dummySignature());
    }

    function test_RevertWhenDestinationIsZeroAddress() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(address(0), currentTime - 60, currentTime + 3600, "");

        vm.expectRevert(x402Permit2Proxy.InvalidDestination.selector);
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());
    }

    // ============ settle() - Witness Validation Tests ============

    function test_SettleWithExtraData() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness =
            _createWitness(recipient, currentTime - 60, currentTime + 3600, hex"deadbeef");

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        assertEq(token.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    function test_WitnessHashComputedCorrectly() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness =
            _createWitness(recipient, currentTime - 60, currentTime + 3600, hex"1234");

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        // Verify the witness hash was computed correctly by checking the mock
        MockPermit2.PermitWitnessTransferFromCall memory lastCall = mockPermit2.getLastCall();

        bytes32 expectedWitnessHash = keccak256(
            abi.encode(
                proxy.WITNESS_TYPEHASH(), keccak256(witness.extra), witness.to, witness.validAfter, witness.validBefore
            )
        );

        assertEq(lastCall.witness, expectedWitnessHash);
    }

    // ============ Security - Reentrancy Protection Tests ============

    function test_RevertOnReentrancy() public {
        // Deploy malicious Permit2
        MaliciousReentrant maliciousPermit2 = new MaliciousReentrant();

        // Deploy new proxy with malicious Permit2
        x402Permit2Proxy vulnerableProxy = new x402Permit2Proxy(address(maliciousPermit2));
        maliciousPermit2.setTarget(address(vulnerableProxy));

        // Set up token and approvals
        MockERC20 testToken = new MockERC20("Test", "TST", 6);
        testToken.mint(payer, MINT_AMOUNT);
        vm.prank(payer);
        testToken.approve(address(maliciousPermit2), type(uint256).max);

        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(testToken), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        // Set up attack parameters
        maliciousPermit2.setAttemptReentry(true);
        maliciousPermit2.setAttackParams(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        // Should revert due to reentrancy guard
        vm.expectRevert();
        vm.prank(facilitator);
        vulnerableProxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());
    }

    // ============ Security - Destination Immutability Tests ============

    function test_CannotRedirectFunds() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        // Witness specifies recipient as destination
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        // Verify funds went to recipient (from witness), not facilitator
        assertEq(token.balanceOf(recipient), TRANSFER_AMOUNT);
        assertEq(token.balanceOf(facilitator), 0);
    }

    // ============ settleWith2612() Tests ============

    function test_SettleWith2612TransfersTokens() public {
        // Deploy token with EIP-2612 support
        MockERC20Permit permitToken = new MockERC20Permit("Test USDC", "USDC", 6);
        permitToken.mint(payer, MINT_AMOUNT);

        // Pre-approve mockPermit2 (simulating EIP-2612 permit succeeded)
        vm.prank(payer);
        permitToken.approve(address(mockPermit2), type(uint256).max);

        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(permitToken), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        x402Permit2Proxy.EIP2612Permit memory permit2612 = x402Permit2Proxy.EIP2612Permit({
            value: type(uint256).max,
            deadline: currentTime + 3600,
            v: 27,
            r: bytes32(uint256(1)),
            s: bytes32(uint256(2))
        });

        vm.prank(facilitator);
        proxy.settleWith2612(permit2612, permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        assertEq(permitToken.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    function test_SettleWith2612SucceedsWhenPermitFails() public {
        // Deploy token with EIP-2612 support
        MockERC20Permit permitToken = new MockERC20Permit("Test USDC", "USDC", 6);
        permitToken.mint(payer, MINT_AMOUNT);

        // Set permit to revert
        permitToken.setPermitRevert(true, "Permit failed");

        // But pre-approve Permit2 (so settlement can still work)
        vm.prank(payer);
        permitToken.approve(address(mockPermit2), type(uint256).max);

        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(permitToken), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        x402Permit2Proxy.EIP2612Permit memory permit2612 = x402Permit2Proxy.EIP2612Permit({
            value: type(uint256).max,
            deadline: currentTime + 3600,
            v: 27,
            r: bytes32(uint256(1)),
            s: bytes32(uint256(2))
        });

        // Should succeed because approval already exists
        vm.prank(facilitator);
        proxy.settleWith2612(permit2612, permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        assertEq(permitToken.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    // ============ Multiple Settlements Tests ============

    function test_MultipleSettlementsWithDifferentNonces() public {
        uint256 currentTime = block.timestamp;
        uint256 settlementAmount = 25e6;

        for (uint256 i = 0; i < 3; i++) {
            ISignatureTransfer.PermitTransferFrom memory permit =
                _createPermit(address(token), settlementAmount, i, currentTime + 3600);
            x402Permit2Proxy.Witness memory witness =
                _createWitness(recipient, currentTime - 60, currentTime + 3600, abi.encodePacked(i));

            vm.prank(facilitator);
            proxy.settle(permit, settlementAmount, payer, witness, _dummySignature());
        }

        assertEq(token.balanceOf(recipient), settlementAmount * 3);
    }

    // ============ Invariant: Proxy Never Holds Tokens ============

    function test_ProxyNeverHoldsTokens() public {
        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        // Proxy should never hold tokens
        assertEq(token.balanceOf(address(proxy)), 0);
    }

    // ============ Fuzz Tests ============

    function testFuzz_SettleWithinTimeWindow(uint256 validAfter, uint256 validBefore, uint256 currentTime) public {
        // Bound inputs to reasonable ranges
        validAfter = bound(validAfter, 0, type(uint128).max - 1);
        validBefore = bound(validBefore, validAfter + 1, type(uint128).max);
        currentTime = bound(currentTime, validAfter, validBefore);

        vm.warp(currentTime);

        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, validAfter, validBefore, "");

        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());

        assertEq(token.balanceOf(recipient), TRANSFER_AMOUNT);
    }

    function testFuzz_RevertOutsideTimeWindow(uint256 validAfter, uint256 validBefore, uint256 currentTime) public {
        // Ensure we're outside the window
        validAfter = bound(validAfter, 1000, type(uint128).max - 1000);
        validBefore = bound(validBefore, validAfter + 1, type(uint128).max - 1);

        // currentTime is either before validAfter or after validBefore
        if (currentTime % 2 == 0) {
            currentTime = bound(currentTime, 0, validAfter - 1);
        } else {
            currentTime = bound(currentTime, validBefore + 1, type(uint128).max);
        }

        vm.warp(currentTime);

        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), TRANSFER_AMOUNT, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, validAfter, validBefore, "");

        vm.expectRevert();
        vm.prank(facilitator);
        proxy.settle(permit, TRANSFER_AMOUNT, payer, witness, _dummySignature());
    }

    function testFuzz_AmountNeverExceedsPermitted(uint256 permitted, uint256 requested) public {
        permitted = bound(permitted, 1, type(uint128).max);
        requested = bound(requested, permitted + 1, type(uint256).max);

        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), permitted, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        vm.expectRevert(x402Permit2Proxy.AmountExceedsPermitted.selector);
        vm.prank(facilitator);
        proxy.settle(permit, requested, payer, witness, _dummySignature());
    }

    function testFuzz_ValidPartialAmounts(uint256 permitted, uint256 requested) public {
        permitted = bound(permitted, 1, MINT_AMOUNT);
        requested = bound(requested, 0, permitted);

        uint256 currentTime = block.timestamp;
        ISignatureTransfer.PermitTransferFrom memory permit =
            _createPermit(address(token), permitted, 0, currentTime + 3600);
        x402Permit2Proxy.Witness memory witness = _createWitness(recipient, currentTime - 60, currentTime + 3600, "");

        vm.prank(facilitator);
        proxy.settle(permit, requested, payer, witness, _dummySignature());

        assertEq(token.balanceOf(recipient), requested);
    }
}
