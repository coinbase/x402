// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {x402BatchSettlement} from "../src/x402BatchSettlement.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC20Permit} from "./mocks/MockERC20Permit.sol";
import {MockERC3009Token} from "./mocks/MockERC3009Token.sol";

contract X402BatchSettlementTest is Test {
    x402BatchSettlement public settlement;
    MockPermit2 public mockPermit2;
    MockERC20 public token;
    MockERC20Permit public permitToken;
    MockERC3009Token public erc3009Token;

    VmSafe.Wallet public authorizerWallet;
    VmSafe.Wallet public payerWallet;
    VmSafe.Wallet public delegateWallet;
    address public recipient;

    bytes32 constant SERVICE_ID = keccak256("test-service");
    uint64 constant WITHDRAW_WINDOW = 3600; // 1 hour (within 15min–30day bounds)
    uint128 constant DEPOSIT_AMOUNT = 1000e6;
    uint128 constant CLAIM_AMOUNT = 100e6;

    event ServiceRegistered(
        bytes32 indexed serviceId, address indexed payTo, address authorizer, uint64 withdrawWindow
    );
    event Deposited(bytes32 indexed serviceId, address indexed payer, address indexed token, uint128 amount, uint128 newDeposit);
    event Claimed(bytes32 indexed serviceId, address indexed token, uint128 totalDelta, uint128 newUnsettled);
    event Settled(bytes32 indexed serviceId, address indexed token, address indexed payTo, uint128 amount);
    event WithdrawalRequested(bytes32 indexed serviceId, address indexed payer, address indexed token, uint64 withdrawEligibleAt);
    event Withdrawn(bytes32 indexed serviceId, address indexed payer, address indexed token, uint128 refund);
    event ClientSignerAuthorized(bytes32 indexed serviceId, address indexed payer, address indexed signer);
    event ClientSignerRevoked(bytes32 indexed serviceId, address indexed payer, address indexed signer);
    event AuthorizerAdded(bytes32 indexed serviceId, address indexed newAuthorizer);
    event AuthorizerRemoved(bytes32 indexed serviceId, address indexed target);
    event PayToUpdated(bytes32 indexed serviceId, address indexed newPayTo);
    event WithdrawWindowUpdated(bytes32 indexed serviceId, uint64 newWindow);

    function setUp() public {
        vm.warp(1_000_000);

        authorizerWallet = vm.createWallet("authorizer");
        payerWallet = vm.createWallet("payer");
        delegateWallet = vm.createWallet("delegate");
        recipient = makeAddr("recipient");

        mockPermit2 = new MockPermit2();
        settlement = new x402BatchSettlement(address(mockPermit2));

        token = new MockERC20("USDC", "USDC", 6);
        permitToken = new MockERC20Permit("PermitUSDC", "pUSDC", 6);
        erc3009Token = new MockERC3009Token("USDC3009", "USDC3009", 6);

        token.mint(payerWallet.addr, 100_000e6);
        permitToken.mint(payerWallet.addr, 100_000e6);
        erc3009Token.mint(payerWallet.addr, 100_000e6);

        vm.prank(payerWallet.addr);
        token.approve(address(mockPermit2), type(uint256).max);
        vm.prank(payerWallet.addr);
        permitToken.approve(address(mockPermit2), type(uint256).max);
        mockPermit2.setShouldActuallyTransfer(true);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _registerService() internal {
        settlement.register(SERVICE_ID, recipient, authorizerWallet.addr, WITHDRAW_WINDOW);
    }

    function _signTypedData(VmSafe.Wallet memory wallet, bytes32 structHash) internal returns (bytes memory) {
        bytes32 digest = _hashTypedData(structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wallet, digest);
        return abi.encodePacked(r, s, v);
    }

    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", settlement.domainSeparator(), structHash));
    }

    function _depositWithPermit2(uint128 amount) internal {
        _depositWithPermit2ForPayer(payerWallet.addr, amount, 0);
    }

    function _depositWithPermit2ForPayer(address payer, uint128 amount, uint256 nonce) internal {
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: amount}),
            nonce: nonce,
            deadline: block.timestamp + 3600
        });
        x402BatchSettlement.DepositWitness memory witness = x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID});
        bytes memory sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        settlement.depositWithPermit2(permit, payer, witness, sig);
    }

    function _depositERC3009(uint128 amount) internal {
        bytes memory sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        settlement.depositWithERC3009(
            SERVICE_ID, payerWallet.addr, address(erc3009Token), amount, 0, block.timestamp + 3600, bytes32(0), sig
        );
    }

    function _signVoucher(VmSafe.Wallet memory wallet, address payerAddr, address tokenAddr, uint128 cumulativeAmount, uint64 nonce)
        internal
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(settlement.VOUCHER_TYPEHASH(), SERVICE_ID, payerAddr, tokenAddr, cumulativeAmount, nonce)
        );
        return _signTypedData(wallet, structHash);
    }

    function _signCooperativeWithdraw(VmSafe.Wallet memory wallet, address payerAddr, address tokenAddr, uint64 withdrawNonce)
        internal
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(settlement.COOPERATIVE_WITHDRAW_TYPEHASH(), SERVICE_ID, payerAddr, tokenAddr, withdrawNonce)
        );
        return _signTypedData(wallet, structHash);
    }

    function _signRequestWithdrawal(VmSafe.Wallet memory wallet, address payerAddr, address tokenAddr, uint64 withdrawNonce)
        internal
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(settlement.REQUEST_WITHDRAWAL_TYPEHASH(), SERVICE_ID, payerAddr, tokenAddr, withdrawNonce)
        );
        return _signTypedData(wallet, structHash);
    }

    function _dummySig() internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
    }

    // =========================================================================
    // Constructor
    // =========================================================================

    function test_constructor_revertsOnZeroPermit2() public {
        vm.expectRevert(x402BatchSettlement.InvalidPermit2Address.selector);
        new x402BatchSettlement(address(0));
    }

    function test_constructor_setsPermit2() public view {
        assertEq(address(settlement.PERMIT2()), address(mockPermit2));
    }

    // =========================================================================
    // Registration
    // =========================================================================

    function test_register_success() public {
        vm.expectEmit(true, true, false, true);
        emit ServiceRegistered(SERVICE_ID, recipient, authorizerWallet.addr, WITHDRAW_WINDOW);
        _registerService();

        x402BatchSettlement.Service memory svc = settlement.getService(SERVICE_ID);
        assertTrue(svc.registered);
        assertEq(svc.payTo, recipient);
        assertEq(svc.withdrawWindow, WITHDRAW_WINDOW);
        assertTrue(settlement.isAuthorizer(SERVICE_ID, authorizerWallet.addr));
        assertEq(settlement.authorizerCount(SERVICE_ID), 1);
    }

    function test_register_revertsIfAlreadyRegistered() public {
        _registerService();
        vm.expectRevert(x402BatchSettlement.ServiceAlreadyRegistered.selector);
        _registerService();
    }

    function test_register_revertsOnZeroPayTo() public {
        vm.expectRevert(x402BatchSettlement.InvalidPayTo.selector);
        settlement.register(SERVICE_ID, address(0), authorizerWallet.addr, WITHDRAW_WINDOW);
    }

    function test_register_revertsOnZeroAuthorizer() public {
        vm.expectRevert(x402BatchSettlement.InvalidAuthorizer.selector);
        settlement.register(SERVICE_ID, recipient, address(0), WITHDRAW_WINDOW);
    }

    function test_registerFor_success() public {
        bytes32 structHash = keccak256(
            abi.encode(settlement.REGISTER_TYPEHASH(), SERVICE_ID, recipient, authorizerWallet.addr, WITHDRAW_WINDOW)
        );
        bytes memory sig = _signTypedData(authorizerWallet, structHash);
        settlement.registerFor(SERVICE_ID, recipient, authorizerWallet.addr, WITHDRAW_WINDOW, sig);

        assertTrue(settlement.getService(SERVICE_ID).registered);
    }

    function test_registerFor_revertsOnBadSignature() public {
        bytes32 structHash = keccak256(
            abi.encode(settlement.REGISTER_TYPEHASH(), SERVICE_ID, recipient, authorizerWallet.addr, WITHDRAW_WINDOW)
        );
        bytes memory sig = _signTypedData(payerWallet, structHash);

        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.registerFor(SERVICE_ID, recipient, authorizerWallet.addr, WITHDRAW_WINDOW, sig);
    }

    function test_registerFor_revertsOnMalformedSignature() public {
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.registerFor(SERVICE_ID, recipient, authorizerWallet.addr, WITHDRAW_WINDOW, hex"deadbeef");
    }

    // =========================================================================
    // Deposit — ERC-3009
    // =========================================================================

    function test_depositWithERC3009_success() public {
        _registerService();
        vm.expectEmit(true, true, true, true);
        emit Deposited(SERVICE_ID, payerWallet.addr, address(erc3009Token), DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        _depositERC3009(DEPOSIT_AMOUNT);

        x402BatchSettlement.Subchannel memory sub =
            settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(erc3009Token));
        assertEq(sub.deposit, DEPOSIT_AMOUNT);
        assertEq(erc3009Token.balanceOf(address(settlement)), DEPOSIT_AMOUNT);
    }

    function test_depositWithERC3009_revertsIfNotRegistered() public {
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.depositWithERC3009(
            SERVICE_ID, payerWallet.addr, address(erc3009Token), DEPOSIT_AMOUNT, 0, block.timestamp + 3600, bytes32(0), _dummySig()
        );
    }

    function test_depositWithERC3009_revertsOnZeroAmount() public {
        _registerService();
        vm.expectRevert(x402BatchSettlement.ZeroDeposit.selector);
        settlement.depositWithERC3009(
            SERVICE_ID, payerWallet.addr, address(erc3009Token), 0, 0, block.timestamp + 3600, bytes32(0), _dummySig()
        );
    }

    function test_depositWithERC3009_cancelsWithdrawalRequest() public {
        _registerService();
        _depositERC3009(DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(erc3009Token));
        assertGt(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(erc3009Token)).withdrawRequestedAt, 0);

        _depositERC3009(DEPOSIT_AMOUNT);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(erc3009Token)).withdrawRequestedAt, 0);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(erc3009Token)).deposit, DEPOSIT_AMOUNT * 2);
    }

    function test_depositWithERC3009_revertsOnOverflow() public {
        _registerService();
        uint128 huge = type(uint128).max;
        erc3009Token.mint(payerWallet.addr, huge);
        settlement.depositWithERC3009(
            SERVICE_ID, payerWallet.addr, address(erc3009Token), huge, 0, block.timestamp + 3600, bytes32(0), _dummySig()
        );
        erc3009Token.mint(payerWallet.addr, 1);
        vm.expectRevert(x402BatchSettlement.DepositOverflow.selector);
        settlement.depositWithERC3009(
            SERVICE_ID, payerWallet.addr, address(erc3009Token), 1, 0, block.timestamp + 3600, bytes32(uint256(1)), _dummySig()
        );
    }

    // =========================================================================
    // Deposit — Permit2
    // =========================================================================

    function test_depositWithPermit2_success() public {
        _registerService();
        vm.expectEmit(true, true, true, true);
        emit Deposited(SERVICE_ID, payerWallet.addr, address(token), DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        _depositWithPermit2(DEPOSIT_AMOUNT);

        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).deposit, DEPOSIT_AMOUNT);
        assertEq(token.balanceOf(address(settlement)), DEPOSIT_AMOUNT);
    }

    function test_depositWithPermit2_revertsIfNotRegistered() public {
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: DEPOSIT_AMOUNT}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.depositWithPermit2(permit, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
    }

    function test_depositWithPermit2_cancelsWithdrawalRequest() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
        assertGt(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).withdrawRequestedAt, 0);

        _depositWithPermit2ForPayer(payerWallet.addr, DEPOSIT_AMOUNT, 1);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).withdrawRequestedAt, 0);
    }

    function test_depositWithPermit2_noPendingWithdrawal() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        _depositWithPermit2ForPayer(payerWallet.addr, DEPOSIT_AMOUNT, 1);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).deposit, DEPOSIT_AMOUNT * 2);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).withdrawRequestedAt, 0);
    }

    function test_depositWithPermit2_revertsOnOverflow() public {
        _registerService();
        uint128 huge = type(uint128).max;
        token.mint(payerWallet.addr, huge);
        ISignatureTransfer.PermitTransferFrom memory p1 = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: huge}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        settlement.depositWithPermit2(p1, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());

        ISignatureTransfer.PermitTransferFrom memory p2 = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: 1}),
            nonce: 1, deadline: block.timestamp + 3600
        });
        vm.expectRevert(x402BatchSettlement.DepositOverflow.selector);
        settlement.depositWithPermit2(p2, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
    }

    function test_depositWithPermit2_revertsOnUint128Overflow() public {
        _registerService();
        uint256 tooLarge = uint256(type(uint128).max) + 1;
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: tooLarge}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        vm.expectRevert(x402BatchSettlement.DepositOverflow.selector);
        settlement.depositWithPermit2(permit, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
    }

    // =========================================================================
    // Deposit — Permit2 + EIP-2612
    // =========================================================================

    function test_depositWithPermit2AndEIP2612_success() public {
        _registerService();
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: DEPOSIT_AMOUNT}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory p2612 = x402BatchSettlement.EIP2612Permit({
            value: DEPOSIT_AMOUNT, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        settlement.depositWithPermit2AndEIP2612(p2612, permit, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(permitToken)).deposit, DEPOSIT_AMOUNT);
    }

    function test_depositWithPermit2AndEIP2612_permitFailsWithReason_stillSucceeds() public {
        _registerService();
        permitToken.setPermitRevert(true, "mock-revert");
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: DEPOSIT_AMOUNT}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory p2612 = x402BatchSettlement.EIP2612Permit({
            value: DEPOSIT_AMOUNT, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        settlement.depositWithPermit2AndEIP2612(p2612, permit, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(permitToken)).deposit, DEPOSIT_AMOUNT);
    }

    function test_depositWithPermit2AndEIP2612_permitFailsWithPanic_stillSucceeds() public {
        _registerService();
        permitToken.setRevertMode(MockERC20Permit.RevertMode.Panic);
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: DEPOSIT_AMOUNT}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory p2612 = x402BatchSettlement.EIP2612Permit({
            value: DEPOSIT_AMOUNT, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        settlement.depositWithPermit2AndEIP2612(p2612, permit, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(permitToken)).deposit, DEPOSIT_AMOUNT);
    }

    function test_depositWithPermit2AndEIP2612_permitFailsWithCustomError_stillSucceeds() public {
        _registerService();
        permitToken.setRevertMode(MockERC20Permit.RevertMode.CustomError);
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: DEPOSIT_AMOUNT}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory p2612 = x402BatchSettlement.EIP2612Permit({
            value: DEPOSIT_AMOUNT, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        settlement.depositWithPermit2AndEIP2612(p2612, permit, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(permitToken)).deposit, DEPOSIT_AMOUNT);
    }

    function test_depositWithPermit2AndEIP2612_revertsOnAmountMismatch() public {
        _registerService();
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: DEPOSIT_AMOUNT}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory p2612 = x402BatchSettlement.EIP2612Permit({
            value: DEPOSIT_AMOUNT + 1, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        vm.expectRevert(x402BatchSettlement.Permit2612AmountMismatch.selector);
        settlement.depositWithPermit2AndEIP2612(p2612, permit, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
    }

    function test_depositWithPermit2AndEIP2612_cancelsWithdrawalRequest() public {
        _registerService();
        ISignatureTransfer.PermitTransferFrom memory p1 = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: DEPOSIT_AMOUNT}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory e1 = x402BatchSettlement.EIP2612Permit({
            value: DEPOSIT_AMOUNT, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        settlement.depositWithPermit2AndEIP2612(e1, p1, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());

        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(permitToken));
        assertGt(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(permitToken)).withdrawRequestedAt, 0);

        ISignatureTransfer.PermitTransferFrom memory p2 = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: DEPOSIT_AMOUNT}),
            nonce: 1, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory e2 = x402BatchSettlement.EIP2612Permit({
            value: DEPOSIT_AMOUNT, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        settlement.depositWithPermit2AndEIP2612(e2, p2, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(permitToken)).withdrawRequestedAt, 0);
    }

    function test_depositWithPermit2AndEIP2612_revertsOnOverflow() public {
        _registerService();
        uint128 huge = type(uint128).max;
        permitToken.mint(payerWallet.addr, huge);
        ISignatureTransfer.PermitTransferFrom memory p1 = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: huge}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory e1 = x402BatchSettlement.EIP2612Permit({
            value: huge, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        settlement.depositWithPermit2AndEIP2612(e1, p1, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());

        ISignatureTransfer.PermitTransferFrom memory p2 = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: 1}),
            nonce: 1, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory e2 = x402BatchSettlement.EIP2612Permit({
            value: 1, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        vm.expectRevert(x402BatchSettlement.DepositOverflow.selector);
        settlement.depositWithPermit2AndEIP2612(e2, p2, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
    }

    function test_depositWithPermit2AndEIP2612_revertsOnUint128Overflow() public {
        _registerService();
        uint256 tooLarge = uint256(type(uint128).max) + 1;
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(permitToken), amount: tooLarge}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        x402BatchSettlement.EIP2612Permit memory p2612 = x402BatchSettlement.EIP2612Permit({
            value: tooLarge, deadline: block.timestamp + 3600, v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))
        });
        vm.expectRevert(x402BatchSettlement.DepositOverflow.selector);
        settlement.depositWithPermit2AndEIP2612(p2612, permit, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());
    }

    // =========================================================================
    // Claim & Settle
    // =========================================================================

    function test_claim_and_settle_success() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);

        bytes memory voucherSig = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({
            payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: voucherSig
        });

        vm.expectEmit(true, true, false, true);
        emit Claimed(SERVICE_ID, address(token), CLAIM_AMOUNT, CLAIM_AMOUNT);
        settlement.claim(SERVICE_ID, address(token), claims);
        assertEq(settlement.getUnsettled(SERVICE_ID, address(token)), CLAIM_AMOUNT);

        uint256 recipientBefore = token.balanceOf(recipient);
        settlement.settle(SERVICE_ID, address(token));
        assertEq(token.balanceOf(recipient), recipientBefore + CLAIM_AMOUNT);
        assertEq(settlement.getUnsettled(SERVICE_ID, address(token)), 0);
    }

    function test_claim_withDelegatedSigner() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        vm.prank(payerWallet.addr);
        settlement.authorizeClientSigner(SERVICE_ID, delegateWallet.addr);

        bytes memory voucherSig = _signVoucher(delegateWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({
            payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: voucherSig
        });
        settlement.claim(SERVICE_ID, address(token), claims);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).totalClaimed, CLAIM_AMOUNT);
    }

    function test_claim_revertsOnBadSignature() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        VmSafe.Wallet memory randomWallet = vm.createWallet("random");
        bytes memory badSig = _signVoucher(randomWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({
            payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: badSig
        });
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.claim(SERVICE_ID, address(token), claims);
    }

    function test_claim_revertsOnNonIncreasingNonce() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory sig1 = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory c1 = new x402BatchSettlement.VoucherClaim[](1);
        c1[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: sig1});
        settlement.claim(SERVICE_ID, address(token), c1);

        bytes memory sig2 = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT * 2, 1);
        x402BatchSettlement.VoucherClaim[] memory c2 = new x402BatchSettlement.VoucherClaim[](1);
        c2[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT * 2, claimAmount: CLAIM_AMOUNT * 2, nonce: 1, signature: sig2});
        vm.expectRevert(x402BatchSettlement.NonceNotIncreasing.selector);
        settlement.claim(SERVICE_ID, address(token), c2);
    }

    function test_claim_revertsOnClaimAmountExceedsDeposit() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        uint128 tooMuch = DEPOSIT_AMOUNT + 1;
        bytes memory sig = _signVoucher(payerWallet, payerWallet.addr, address(token), tooMuch, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: tooMuch, claimAmount: tooMuch, nonce: 1, signature: sig});
        vm.expectRevert(x402BatchSettlement.ClaimAmountExceedsDeposit.selector);
        settlement.claim(SERVICE_ID, address(token), claims);
    }

    function test_claim_revertsOnClaimAmountExceedsCumulativeAmount() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory sig = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT + 1, nonce: 1, signature: sig});
        vm.expectRevert(x402BatchSettlement.ClaimAmountExceedsCumulativeAmount.selector);
        settlement.claim(SERVICE_ID, address(token), claims);
    }

    function test_claim_revertsOnClaimAmountNotIncreasing() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory sig1 = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory c1 = new x402BatchSettlement.VoucherClaim[](1);
        c1[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: sig1});
        settlement.claim(SERVICE_ID, address(token), c1);

        bytes memory sig2 = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT * 2, 2);
        x402BatchSettlement.VoucherClaim[] memory c2 = new x402BatchSettlement.VoucherClaim[](1);
        c2[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT * 2, claimAmount: CLAIM_AMOUNT, nonce: 2, signature: sig2});
        vm.expectRevert(x402BatchSettlement.ClaimAmountNotIncreasing.selector);
        settlement.claim(SERVICE_ID, address(token), c2);
    }

    function test_claim_revertsOnServiceNotRegistered() public {
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](0);
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.claim(SERVICE_ID, address(token), claims);
    }

    function test_claim_revokedDelegateCannotSign() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        vm.prank(payerWallet.addr);
        settlement.authorizeClientSigner(SERVICE_ID, delegateWallet.addr);
        vm.prank(payerWallet.addr);
        settlement.revokeClientSigner(SERVICE_ID, delegateWallet.addr);

        bytes memory voucherSig = _signVoucher(delegateWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: voucherSig});
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.claim(SERVICE_ID, address(token), claims);
    }

    function test_settle_revertsOnNothingToSettle() public {
        _registerService();
        vm.expectRevert(x402BatchSettlement.NothingToSettle.selector);
        settlement.settle(SERVICE_ID, address(token));
    }

    function test_settle_revertsOnServiceNotRegistered() public {
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.settle(SERVICE_ID, address(token));
    }

    function test_settle_revertsOnTransferFailed() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory sig = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: sig});
        settlement.claim(SERVICE_ID, address(token), claims);

        vm.mockCall(address(token), abi.encodeWithSelector(token.transfer.selector), abi.encode(false));
        vm.expectRevert(); // SafeERC20 revert
        settlement.settle(SERVICE_ID, address(token));
        vm.clearMockedCalls();
    }

    // =========================================================================
    // Client Signer Delegation
    // =========================================================================

    function test_authorizeClientSigner_success() public {
        vm.prank(payerWallet.addr);
        settlement.authorizeClientSigner(SERVICE_ID, delegateWallet.addr);
        assertTrue(settlement.isClientSigner(SERVICE_ID, payerWallet.addr, delegateWallet.addr));
    }

    function test_revokeClientSigner_success() public {
        vm.prank(payerWallet.addr);
        settlement.authorizeClientSigner(SERVICE_ID, delegateWallet.addr);
        vm.prank(payerWallet.addr);
        settlement.revokeClientSigner(SERVICE_ID, delegateWallet.addr);
        assertFalse(settlement.isClientSigner(SERVICE_ID, payerWallet.addr, delegateWallet.addr));
    }

    function test_authorizeClientSignerFor_success() public {
        uint256 nonce = settlement.clientNonces(SERVICE_ID, payerWallet.addr);
        bytes32 structHash = keccak256(abi.encode(settlement.AUTHORIZE_CLIENT_SIGNER_TYPEHASH(), SERVICE_ID, payerWallet.addr, delegateWallet.addr, nonce));
        bytes memory sig = _signTypedData(payerWallet, structHash);
        settlement.authorizeClientSignerFor(SERVICE_ID, payerWallet.addr, delegateWallet.addr, sig);
        assertTrue(settlement.isClientSigner(SERVICE_ID, payerWallet.addr, delegateWallet.addr));
        assertEq(settlement.clientNonces(SERVICE_ID, payerWallet.addr), nonce + 1);
    }

    function test_revokeClientSignerFor_success() public {
        vm.prank(payerWallet.addr);
        settlement.authorizeClientSigner(SERVICE_ID, delegateWallet.addr);
        uint256 nonce = settlement.clientNonces(SERVICE_ID, payerWallet.addr);
        bytes32 structHash = keccak256(abi.encode(settlement.REVOKE_CLIENT_SIGNER_TYPEHASH(), SERVICE_ID, payerWallet.addr, delegateWallet.addr, nonce));
        bytes memory sig = _signTypedData(payerWallet, structHash);
        settlement.revokeClientSignerFor(SERVICE_ID, payerWallet.addr, delegateWallet.addr, sig);
        assertFalse(settlement.isClientSigner(SERVICE_ID, payerWallet.addr, delegateWallet.addr));
    }

    function test_authorizeClientSigner_revertsOnZeroSigner() public {
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.InvalidSigner.selector);
        settlement.authorizeClientSigner(SERVICE_ID, address(0));
    }

    function test_authorizeClientSignerFor_revertsOnBadSignature() public {
        bytes32 structHash = keccak256(abi.encode(settlement.AUTHORIZE_CLIENT_SIGNER_TYPEHASH(), SERVICE_ID, payerWallet.addr, delegateWallet.addr, 0));
        bytes memory sig = _signTypedData(delegateWallet, structHash);
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.authorizeClientSignerFor(SERVICE_ID, payerWallet.addr, delegateWallet.addr, sig);
    }

    function test_authorizeClientSignerFor_revertsOnZeroSigner() public {
        bytes32 structHash = keccak256(abi.encode(settlement.AUTHORIZE_CLIENT_SIGNER_TYPEHASH(), SERVICE_ID, payerWallet.addr, address(0), 0));
        bytes memory sig = _signTypedData(payerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.InvalidSigner.selector);
        settlement.authorizeClientSignerFor(SERVICE_ID, payerWallet.addr, address(0), sig);
    }

    function test_revokeClientSignerFor_revertsOnBadSignature() public {
        bytes32 structHash = keccak256(abi.encode(settlement.REVOKE_CLIENT_SIGNER_TYPEHASH(), SERVICE_ID, payerWallet.addr, delegateWallet.addr, 0));
        bytes memory sig = _signTypedData(delegateWallet, structHash);
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.revokeClientSignerFor(SERVICE_ID, payerWallet.addr, delegateWallet.addr, sig);
    }

    // =========================================================================
    // Withdrawal
    // =========================================================================

    function test_requestWithdrawal_and_withdraw() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).withdrawRequestedAt, uint64(block.timestamp));

        vm.expectRevert(x402BatchSettlement.WithdrawWindowNotElapsed.selector);
        settlement.withdraw(SERVICE_ID, payerWallet.addr, address(token));

        vm.warp(block.timestamp + WITHDRAW_WINDOW);
        uint256 payerBal = token.balanceOf(payerWallet.addr);
        settlement.withdraw(SERVICE_ID, payerWallet.addr, address(token));
        assertEq(token.balanceOf(payerWallet.addr), payerBal + DEPOSIT_AMOUNT);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).deposit, 0);
    }

    function test_requestWithdrawalFor_success() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        uint64 withdrawNonce = settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).withdrawNonce;
        bytes memory sig = _signRequestWithdrawal(payerWallet, payerWallet.addr, address(token), withdrawNonce);
        settlement.requestWithdrawalFor(SERVICE_ID, payerWallet.addr, address(token), sig);
        assertGt(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).withdrawRequestedAt, 0);
    }

    function test_requestWithdrawalFor_revertsOnBadSignature() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory sig = _signRequestWithdrawal(delegateWallet, payerWallet.addr, address(token), 0);
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.requestWithdrawalFor(SERVICE_ID, payerWallet.addr, address(token), sig);
    }

    function test_requestWithdrawal_revertsOnAlreadyRequested() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.WithdrawalAlreadyRequested.selector);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
    }

    function test_requestWithdrawal_revertsOnNothingToWithdraw() public {
        _registerService();
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.NothingToWithdraw.selector);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
    }

    function test_requestWithdrawal_revertsOnServiceNotRegistered() public {
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
    }

    function test_cooperativeWithdraw_success() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory authSig = _signCooperativeWithdraw(authorizerWallet, payerWallet.addr, address(token), 0);
        x402BatchSettlement.CooperativeWithdrawRequest[] memory reqs = new x402BatchSettlement.CooperativeWithdrawRequest[](1);
        reqs[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payerWallet.addr, authorizerSignature: authSig});

        uint256 payerBal = token.balanceOf(payerWallet.addr);
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);
        assertEq(token.balanceOf(payerWallet.addr), payerBal + DEPOSIT_AMOUNT);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).withdrawNonce, 1);
    }

    function test_cooperativeWithdraw_revertsOnNotAuthorizer() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory badSig = _signCooperativeWithdraw(payerWallet, payerWallet.addr, address(token), 0);
        x402BatchSettlement.CooperativeWithdrawRequest[] memory reqs = new x402BatchSettlement.CooperativeWithdrawRequest[](1);
        reqs[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payerWallet.addr, authorizerSignature: badSig});
        vm.expectRevert(x402BatchSettlement.NotAuthorizer.selector);
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);
    }

    function test_cooperativeWithdraw_revertsOnServiceNotRegistered() public {
        x402BatchSettlement.CooperativeWithdrawRequest[] memory reqs = new x402BatchSettlement.CooperativeWithdrawRequest[](0);
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);
    }

    function test_cooperativeWithdraw_revertsOnNothingToWithdraw() public {
        _registerService();
        bytes memory authSig = _signCooperativeWithdraw(authorizerWallet, payerWallet.addr, address(token), 0);
        x402BatchSettlement.CooperativeWithdrawRequest[] memory reqs = new x402BatchSettlement.CooperativeWithdrawRequest[](1);
        reqs[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payerWallet.addr, authorizerSignature: authSig});
        vm.expectRevert(x402BatchSettlement.NothingToWithdraw.selector);
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);
    }

    function test_withdraw_zeroRefund() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory sig = _signVoucher(payerWallet, payerWallet.addr, address(token), DEPOSIT_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: DEPOSIT_AMOUNT, claimAmount: DEPOSIT_AMOUNT, nonce: 1, signature: sig});
        settlement.claim(SERVICE_ID, address(token), claims);

        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
        vm.warp(block.timestamp + WITHDRAW_WINDOW);
        uint256 payerBal = token.balanceOf(payerWallet.addr);
        settlement.withdraw(SERVICE_ID, payerWallet.addr, address(token));
        assertEq(token.balanceOf(payerWallet.addr), payerBal);
    }

    function test_cooperativeWithdraw_zeroRefund() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory sig = _signVoucher(payerWallet, payerWallet.addr, address(token), DEPOSIT_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: DEPOSIT_AMOUNT, claimAmount: DEPOSIT_AMOUNT, nonce: 1, signature: sig});
        settlement.claim(SERVICE_ID, address(token), claims);

        bytes memory authSig = _signCooperativeWithdraw(authorizerWallet, payerWallet.addr, address(token), 0);
        x402BatchSettlement.CooperativeWithdrawRequest[] memory reqs = new x402BatchSettlement.CooperativeWithdrawRequest[](1);
        reqs[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payerWallet.addr, authorizerSignature: authSig});
        uint256 payerBal = token.balanceOf(payerWallet.addr);
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);
        assertEq(token.balanceOf(payerWallet.addr), payerBal);
    }

    function test_withdraw_afterPartialClaim() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory sig = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: sig});
        settlement.claim(SERVICE_ID, address(token), claims);

        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
        vm.warp(block.timestamp + WITHDRAW_WINDOW);
        uint256 payerBal = token.balanceOf(payerWallet.addr);
        settlement.withdraw(SERVICE_ID, payerWallet.addr, address(token));
        assertEq(token.balanceOf(payerWallet.addr), payerBal + (DEPOSIT_AMOUNT - CLAIM_AMOUNT));
    }

    function test_withdraw_revertsOnServiceNotRegistered() public {
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.withdraw(SERVICE_ID, payerWallet.addr, address(token));
    }

    function test_withdraw_revertsOnWithdrawalNotRequested() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        vm.expectRevert(x402BatchSettlement.WithdrawalNotRequested.selector);
        settlement.withdraw(SERVICE_ID, payerWallet.addr, address(token));
    }

    function test_withdraw_revertsOnTransferFailed() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
        vm.warp(block.timestamp + WITHDRAW_WINDOW);
        vm.mockCall(address(token), abi.encodeWithSelector(token.transfer.selector), abi.encode(false));
        vm.expectRevert();
        settlement.withdraw(SERVICE_ID, payerWallet.addr, address(token));
        vm.clearMockedCalls();
    }

    function test_cooperativeWithdraw_revertsOnTransferFailed() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        bytes memory authSig = _signCooperativeWithdraw(authorizerWallet, payerWallet.addr, address(token), 0);
        x402BatchSettlement.CooperativeWithdrawRequest[] memory reqs = new x402BatchSettlement.CooperativeWithdrawRequest[](1);
        reqs[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payerWallet.addr, authorizerSignature: authSig});
        vm.mockCall(address(token), abi.encodeWithSelector(token.transfer.selector), abi.encode(false));
        vm.expectRevert();
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);
        vm.clearMockedCalls();
    }

    // =========================================================================
    // Admin Operations
    // =========================================================================

    function test_addAuthorizer_success() public {
        _registerService();
        address newAuth = makeAddr("newAuth");
        bytes32 structHash = keccak256(abi.encode(settlement.ADD_AUTHORIZER_TYPEHASH(), SERVICE_ID, newAuth, 0));
        settlement.addAuthorizer(SERVICE_ID, newAuth, _signTypedData(authorizerWallet, structHash));
        assertTrue(settlement.isAuthorizer(SERVICE_ID, newAuth));
        assertEq(settlement.authorizerCount(SERVICE_ID), 2);
    }

    function test_removeAuthorizer_success() public {
        _registerService();
        address newAuth = makeAddr("newAuth");
        bytes32 addHash = keccak256(abi.encode(settlement.ADD_AUTHORIZER_TYPEHASH(), SERVICE_ID, newAuth, 0));
        settlement.addAuthorizer(SERVICE_ID, newAuth, _signTypedData(authorizerWallet, addHash));

        bytes32 removeHash = keccak256(abi.encode(settlement.REMOVE_AUTHORIZER_TYPEHASH(), SERVICE_ID, newAuth, 1));
        settlement.removeAuthorizer(SERVICE_ID, newAuth, _signTypedData(authorizerWallet, removeHash));
        assertFalse(settlement.isAuthorizer(SERVICE_ID, newAuth));
        assertEq(settlement.authorizerCount(SERVICE_ID), 1);
    }

    function test_removeAuthorizer_revertsOnLastAuthorizer() public {
        _registerService();
        bytes32 structHash = keccak256(abi.encode(settlement.REMOVE_AUTHORIZER_TYPEHASH(), SERVICE_ID, authorizerWallet.addr, 0));
        bytes memory sig = _signTypedData(authorizerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.LastAuthorizer.selector);
        settlement.removeAuthorizer(SERVICE_ID, authorizerWallet.addr, sig);
    }

    function test_removeAuthorizer_selfRemovalAllowedWhenNotLast() public {
        _registerService();
        VmSafe.Wallet memory auth2 = vm.createWallet("auth2");
        bytes32 addHash = keccak256(abi.encode(settlement.ADD_AUTHORIZER_TYPEHASH(), SERVICE_ID, auth2.addr, 0));
        settlement.addAuthorizer(SERVICE_ID, auth2.addr, _signTypedData(authorizerWallet, addHash));
        assertEq(settlement.authorizerCount(SERVICE_ID), 2);

        bytes32 selfRemoveHash = keccak256(abi.encode(settlement.REMOVE_AUTHORIZER_TYPEHASH(), SERVICE_ID, authorizerWallet.addr, 1));
        settlement.removeAuthorizer(SERVICE_ID, authorizerWallet.addr, _signTypedData(authorizerWallet, selfRemoveHash));
        assertFalse(settlement.isAuthorizer(SERVICE_ID, authorizerWallet.addr));
        assertTrue(settlement.isAuthorizer(SERVICE_ID, auth2.addr));
        assertEq(settlement.authorizerCount(SERVICE_ID), 1);
    }

    function test_updatePayTo_success() public {
        _registerService();
        address newPayTo = makeAddr("newPayTo");
        bytes32 structHash = keccak256(abi.encode(settlement.UPDATE_PAY_TO_TYPEHASH(), SERVICE_ID, newPayTo, 0));
        settlement.updatePayTo(SERVICE_ID, newPayTo, _signTypedData(authorizerWallet, structHash));
        assertEq(settlement.getService(SERVICE_ID).payTo, newPayTo);
    }

    function test_updateWithdrawWindow_success() public {
        _registerService();
        uint64 newWindow = 7200;
        bytes32 structHash = keccak256(abi.encode(settlement.UPDATE_WITHDRAW_WINDOW_TYPEHASH(), SERVICE_ID, newWindow, 0));
        settlement.updateWithdrawWindow(SERVICE_ID, newWindow, _signTypedData(authorizerWallet, structHash));
        assertEq(settlement.getService(SERVICE_ID).withdrawWindow, newWindow);
    }

    function test_addAuthorizer_revertsOnServiceNotRegistered() public {
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.addAuthorizer(SERVICE_ID, makeAddr("a"), _dummySig());
    }

    function test_addAuthorizer_revertsOnZeroAddress() public {
        _registerService();
        bytes32 structHash = keccak256(abi.encode(settlement.ADD_AUTHORIZER_TYPEHASH(), SERVICE_ID, address(0), 0));
        bytes memory sig = _signTypedData(authorizerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.InvalidAuthorizer.selector);
        settlement.addAuthorizer(SERVICE_ID, address(0), sig);
    }

    function test_addAuthorizer_revertsOnNotAuthorizer() public {
        _registerService();
        bytes32 structHash = keccak256(abi.encode(settlement.ADD_AUTHORIZER_TYPEHASH(), SERVICE_ID, makeAddr("x"), 0));
        bytes memory sig = _signTypedData(payerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.NotAuthorizer.selector);
        settlement.addAuthorizer(SERVICE_ID, makeAddr("x"), sig);
    }

    function test_removeAuthorizer_revertsOnServiceNotRegistered() public {
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.removeAuthorizer(SERVICE_ID, makeAddr("a"), _dummySig());
    }

    function test_removeAuthorizer_revertsOnNotAuthorizer() public {
        _registerService();
        bytes32 structHash = keccak256(abi.encode(settlement.REMOVE_AUTHORIZER_TYPEHASH(), SERVICE_ID, authorizerWallet.addr, 0));
        bytes memory sig = _signTypedData(payerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.NotAuthorizer.selector);
        settlement.removeAuthorizer(SERVICE_ID, authorizerWallet.addr, sig);
    }

    function test_updatePayTo_revertsOnServiceNotRegistered() public {
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.updatePayTo(SERVICE_ID, makeAddr("p"), _dummySig());
    }

    function test_updatePayTo_revertsOnZeroAddress() public {
        _registerService();
        bytes32 structHash = keccak256(abi.encode(settlement.UPDATE_PAY_TO_TYPEHASH(), SERVICE_ID, address(0), 0));
        bytes memory sig = _signTypedData(authorizerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.InvalidPayTo.selector);
        settlement.updatePayTo(SERVICE_ID, address(0), sig);
    }

    function test_updatePayTo_revertsOnNotAuthorizer() public {
        _registerService();
        bytes32 structHash = keccak256(abi.encode(settlement.UPDATE_PAY_TO_TYPEHASH(), SERVICE_ID, makeAddr("p"), 0));
        bytes memory sig = _signTypedData(payerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.NotAuthorizer.selector);
        settlement.updatePayTo(SERVICE_ID, makeAddr("p"), sig);
    }

    function test_updateWithdrawWindow_revertsOnServiceNotRegistered() public {
        vm.expectRevert(x402BatchSettlement.ServiceNotRegistered.selector);
        settlement.updateWithdrawWindow(SERVICE_ID, 7200, _dummySig());
    }

    function test_updateWithdrawWindow_revertsOnNotAuthorizer() public {
        _registerService();
        bytes32 structHash = keccak256(abi.encode(settlement.UPDATE_WITHDRAW_WINDOW_TYPEHASH(), SERVICE_ID, uint64(7200), 0));
        bytes memory sig = _signTypedData(payerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.NotAuthorizer.selector);
        settlement.updateWithdrawWindow(SERVICE_ID, 7200, sig);
    }

    // =========================================================================
    // Multi-token
    // =========================================================================

    function test_multiToken_separateSubchannels() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);
        _depositERC3009(DEPOSIT_AMOUNT);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).deposit, DEPOSIT_AMOUNT);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(erc3009Token)).deposit, DEPOSIT_AMOUNT);
    }

    // =========================================================================
    // Views
    // =========================================================================

    function test_getVoucherDigest() public view {
        assertNotEq(settlement.getVoucherDigest(SERVICE_ID, payerWallet.addr, address(token), CLAIM_AMOUNT, 1), bytes32(0));
    }

    function test_getCooperativeWithdrawDigest() public view {
        assertNotEq(settlement.getCooperativeWithdrawDigest(SERVICE_ID, payerWallet.addr, address(token), 0), bytes32(0));
    }

    function test_domainSeparator() public view {
        assertNotEq(settlement.domainSeparator(), bytes32(0));
    }

    // =========================================================================
    // NEW: Subchannel reuse after timed withdrawal (nonce preservation)
    // =========================================================================

    function test_subchannelReuse_afterTimedWithdrawal() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);

        bytes memory v1 = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        x402BatchSettlement.VoucherClaim[] memory c1 = new x402BatchSettlement.VoucherClaim[](1);
        c1[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: v1});
        settlement.claim(SERVICE_ID, address(token), c1);

        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(token));
        vm.warp(block.timestamp + WITHDRAW_WINDOW);
        settlement.withdraw(SERVICE_ID, payerWallet.addr, address(token));

        // Simulate session recovery: read state via views
        x402BatchSettlement.Subchannel memory sub = settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token));
        assertEq(sub.deposit, 0);
        assertEq(sub.totalClaimed, 0);
        assertEq(sub.nonce, 1, "nonce preserved after withdrawal");

        // Re-deposit
        _depositWithPermit2ForPayer(payerWallet.addr, DEPOSIT_AMOUNT, 1);
        sub = settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token));
        assertEq(sub.deposit, DEPOSIT_AMOUNT);
        assertEq(sub.nonce, 1, "nonce still preserved after re-deposit");

        // Old voucher replay fails
        vm.expectRevert(x402BatchSettlement.NonceNotIncreasing.selector);
        settlement.claim(SERVICE_ID, address(token), c1);

        // New voucher with nonce=2 succeeds
        bytes memory v2 = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 2);
        x402BatchSettlement.VoucherClaim[] memory c2 = new x402BatchSettlement.VoucherClaim[](1);
        c2[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 2, signature: v2});
        settlement.claim(SERVICE_ID, address(token), c2);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).totalClaimed, CLAIM_AMOUNT);
    }

    // =========================================================================
    // NEW: Cooperative withdraw replay after re-deposit
    // =========================================================================

    function test_cooperativeWithdraw_replayAfterRedeposit() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);

        bytes memory oldSig = _signCooperativeWithdraw(authorizerWallet, payerWallet.addr, address(token), 0);
        x402BatchSettlement.CooperativeWithdrawRequest[] memory reqs = new x402BatchSettlement.CooperativeWithdrawRequest[](1);
        reqs[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payerWallet.addr, authorizerSignature: oldSig});
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);

        // Session recovery: check withdrawNonce incremented
        x402BatchSettlement.Subchannel memory sub = settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token));
        assertEq(sub.withdrawNonce, 1);
        assertEq(sub.deposit, 0);

        // Re-deposit
        _depositWithPermit2ForPayer(payerWallet.addr, DEPOSIT_AMOUNT, 1);
        sub = settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token));
        assertEq(sub.deposit, DEPOSIT_AMOUNT);

        // Old cooperative withdraw signature fails (withdrawNonce mismatch)
        reqs[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payerWallet.addr, authorizerSignature: oldSig});
        vm.expectRevert(x402BatchSettlement.NotAuthorizer.selector);
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);

        // Fresh signature with withdrawNonce=1 succeeds
        bytes memory newSig = _signCooperativeWithdraw(authorizerWallet, payerWallet.addr, address(token), 1);
        reqs[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payerWallet.addr, authorizerSignature: newSig});
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).deposit, 0);
    }

    // =========================================================================
    // NEW: Batch claim atomicity
    // =========================================================================

    function test_claim_batchAtomicity_oneInvalidRevertsAll() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);

        VmSafe.Wallet memory payer2 = vm.createWallet("payer2");
        token.mint(payer2.addr, 100_000e6);
        vm.prank(payer2.addr);
        token.approve(address(mockPermit2), type(uint256).max);
        _depositWithPermit2ForPayer(payer2.addr, DEPOSIT_AMOUNT, 1);

        bytes memory goodSig = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);
        VmSafe.Wallet memory randomWallet = vm.createWallet("rng");
        bytes memory badSig = _signVoucher(randomWallet, payer2.addr, address(token), CLAIM_AMOUNT, 1);

        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](2);
        claims[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: goodSig});
        claims[1] = x402BatchSettlement.VoucherClaim({payer: payer2.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: badSig});

        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.claim(SERVICE_ID, address(token), claims);

        // Verify payer1 state is unchanged (atomic rollback)
        assertEq(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).totalClaimed, 0);
        assertEq(settlement.getUnsettled(SERVICE_ID, address(token)), 0);
    }

    // =========================================================================
    // NEW: Admin nonce contention
    // =========================================================================

    function test_adminNonce_twoOpsAtSameNonce() public {
        _registerService();
        address newAuth = makeAddr("newAuth");
        address newPayTo = makeAddr("newPayTo");

        bytes32 addHash = keccak256(abi.encode(settlement.ADD_AUTHORIZER_TYPEHASH(), SERVICE_ID, newAuth, 0));
        bytes memory addSig = _signTypedData(authorizerWallet, addHash);

        bytes32 payToHash = keccak256(abi.encode(settlement.UPDATE_PAY_TO_TYPEHASH(), SERVICE_ID, newPayTo, 0));
        bytes memory payToSig = _signTypedData(authorizerWallet, payToHash);

        // First succeeds, nonce becomes 1
        settlement.addAuthorizer(SERVICE_ID, newAuth, addSig);
        assertEq(settlement.getService(SERVICE_ID).adminNonce, 1);

        // Second at nonce 0 fails — signer recovers to wrong address for nonce 1
        vm.expectRevert(x402BatchSettlement.NotAuthorizer.selector);
        settlement.updatePayTo(SERVICE_ID, newPayTo, payToSig);
    }

    // =========================================================================
    // NEW: Cross-service voucher rejection
    // =========================================================================

    function test_claim_crossServiceVoucherRejected() public {
        _registerService();
        bytes32 serviceB = keccak256("service-B");
        settlement.register(serviceB, recipient, authorizerWallet.addr, WITHDRAW_WINDOW);

        // Deposit into BOTH services so the claim reaches signature verification
        _depositWithPermit2(DEPOSIT_AMOUNT);
        ISignatureTransfer.PermitTransferFrom memory permitB = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: DEPOSIT_AMOUNT}),
            nonce: 1, deadline: block.timestamp + 3600
        });
        settlement.depositWithPermit2(permitB, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: serviceB}), _dummySig());

        // Sign voucher scoped to SERVICE_ID (A)
        bytes memory voucherForA = _signVoucher(payerWallet, payerWallet.addr, address(token), CLAIM_AMOUNT, 1);

        // Attempt claim against serviceB — signature won't match because serviceId is in the hash
        x402BatchSettlement.VoucherClaim[] memory claims = new x402BatchSettlement.VoucherClaim[](1);
        claims[0] = x402BatchSettlement.VoucherClaim({payer: payerWallet.addr, cumulativeAmount: CLAIM_AMOUNT, claimAmount: CLAIM_AMOUNT, nonce: 1, signature: voucherForA});

        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.claim(serviceB, address(token), claims);
    }

    // =========================================================================
    // NEW: requestWithdrawalFor replay prevention after re-deposit
    // =========================================================================

    function test_requestWithdrawalFor_replayPreventedAfterCooperativeWithdraw() public {
        _registerService();
        _depositWithPermit2(DEPOSIT_AMOUNT);

        // Sign withdrawal request at withdrawNonce=0
        bytes memory withdrawSig = _signRequestWithdrawal(payerWallet, payerWallet.addr, address(token), 0);
        settlement.requestWithdrawalFor(SERVICE_ID, payerWallet.addr, address(token), withdrawSig);
        assertGt(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).withdrawRequestedAt, 0);

        // Cooperative withdraw (increments withdrawNonce to 1)
        bytes memory coopSig = _signCooperativeWithdraw(authorizerWallet, payerWallet.addr, address(token), 0);
        x402BatchSettlement.CooperativeWithdrawRequest[] memory reqs = new x402BatchSettlement.CooperativeWithdrawRequest[](1);
        reqs[0] = x402BatchSettlement.CooperativeWithdrawRequest({payer: payerWallet.addr, authorizerSignature: coopSig});
        settlement.cooperativeWithdraw(SERVICE_ID, address(token), reqs);

        // Re-deposit
        _depositWithPermit2ForPayer(payerWallet.addr, DEPOSIT_AMOUNT, 1);

        // Session recovery: check withdrawNonce
        x402BatchSettlement.Subchannel memory sub = settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token));
        assertEq(sub.withdrawNonce, 1);

        // Replay old signature (withdrawNonce=0) — should fail
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.requestWithdrawalFor(SERVICE_ID, payerWallet.addr, address(token), withdrawSig);

        // Fresh signature with withdrawNonce=1 succeeds
        bytes memory freshSig = _signRequestWithdrawal(payerWallet, payerWallet.addr, address(token), 1);
        settlement.requestWithdrawalFor(SERVICE_ID, payerWallet.addr, address(token), freshSig);
        assertGt(settlement.getSubchannel(SERVICE_ID, payerWallet.addr, address(token)).withdrawRequestedAt, 0);
    }

    // =========================================================================
    // NEW: withdrawWindow bounds validation
    // =========================================================================

    function test_register_revertsOnWithdrawWindowTooSmall() public {
        vm.expectRevert(x402BatchSettlement.WithdrawWindowOutOfRange.selector);
        settlement.register(SERVICE_ID, recipient, authorizerWallet.addr, 0);
    }

    function test_register_revertsOnWithdrawWindowTooLarge() public {
        vm.expectRevert(x402BatchSettlement.WithdrawWindowOutOfRange.selector);
        settlement.register(SERVICE_ID, recipient, authorizerWallet.addr, 31 days);
    }

    function test_register_succeedsAtMinWindow() public {
        settlement.register(SERVICE_ID, recipient, authorizerWallet.addr, 15 minutes);
        assertEq(settlement.getService(SERVICE_ID).withdrawWindow, 15 minutes);
    }

    function test_register_succeedsAtMaxWindow() public {
        settlement.register(SERVICE_ID, recipient, authorizerWallet.addr, 30 days);
        assertEq(settlement.getService(SERVICE_ID).withdrawWindow, 30 days);
    }

    function test_updateWithdrawWindow_revertsOnTooSmall() public {
        _registerService();
        bytes32 structHash = keccak256(abi.encode(settlement.UPDATE_WITHDRAW_WINDOW_TYPEHASH(), SERVICE_ID, uint64(0), 0));
        bytes memory sig = _signTypedData(authorizerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.WithdrawWindowOutOfRange.selector);
        settlement.updateWithdrawWindow(SERVICE_ID, 0, sig);
    }

    function test_updateWithdrawWindow_revertsOnTooLarge() public {
        _registerService();
        bytes32 structHash = keccak256(abi.encode(settlement.UPDATE_WITHDRAW_WINDOW_TYPEHASH(), SERVICE_ID, uint64(31 days), 0));
        bytes memory sig = _signTypedData(authorizerWallet, structHash);
        vm.expectRevert(x402BatchSettlement.WithdrawWindowOutOfRange.selector);
        settlement.updateWithdrawWindow(SERVICE_ID, uint64(31 days), sig);
    }

    // =========================================================================
    // NEW: Minimum withdraw window — instant withdrawal
    // =========================================================================

    function test_withdraw_atMinWindow() public {
        settlement.register(SERVICE_ID, recipient, authorizerWallet.addr, 15 minutes);

        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(token), amount: DEPOSIT_AMOUNT}),
            nonce: 0, deadline: block.timestamp + 3600
        });
        settlement.depositWithPermit2(permit, payerWallet.addr, x402BatchSettlement.DepositWitness({serviceId: SERVICE_ID}), _dummySig());

        vm.prank(payerWallet.addr);
        settlement.requestWithdrawal(SERVICE_ID, address(token));

        vm.warp(block.timestamp + 15 minutes);
        uint256 payerBal = token.balanceOf(payerWallet.addr);
        settlement.withdraw(SERVICE_ID, payerWallet.addr, address(token));
        assertEq(token.balanceOf(payerWallet.addr), payerBal + DEPOSIT_AMOUNT);
    }
}
