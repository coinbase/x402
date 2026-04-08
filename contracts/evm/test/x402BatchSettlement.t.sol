// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {x402BatchSettlement} from "../src/x402BatchSettlement.sol";
import {ISignatureTransfer} from "../src/interfaces/ISignatureTransfer.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC3009Token} from "./mocks/MockERC3009Token.sol";

contract X402BatchSettlementTest is Test {
    x402BatchSettlement public settlement;
    MockPermit2 public mockPermit2;
    MockERC20 public token;
    MockERC3009Token public erc3009Token;

    VmSafe.Wallet public payerWallet;
    VmSafe.Wallet public signerWallet;
    VmSafe.Wallet public receiverWallet;
    VmSafe.Wallet public facilitatorWallet;
    VmSafe.Wallet public otherWallet;

    uint40 constant WITHDRAW_DELAY = 3600; // 1 hour
    uint128 constant DEPOSIT_AMOUNT = 1000e6;
    uint128 constant CLAIM_AMOUNT = 100e6;

    event ChannelCreated(bytes32 indexed channelId, x402BatchSettlement.ChannelConfig config);
    event Deposited(bytes32 indexed channelId, uint128 amount, uint128 newBalance);
    event Claimed(bytes32 indexed channelId, uint128 claimAmount, uint128 newTotalClaimed);
    event Settled(address indexed receiver, address indexed token, uint128 amount);
    event WithdrawInitiated(bytes32 indexed channelId, uint128 amount, uint40 finalizeAfter);
    event WithdrawFinalized(bytes32 indexed channelId, uint128 amount);
    event ChannelMigrated(bytes32 indexed oldChannelId, bytes32 indexed newChannelId, uint128 migratedAmount);

    function setUp() public {
        vm.warp(1_000_000);

        payerWallet = vm.createWallet("payer");
        signerWallet = vm.createWallet("signer");
        receiverWallet = vm.createWallet("receiver");
        facilitatorWallet = vm.createWallet("facilitator");
        otherWallet = vm.createWallet("other");

        mockPermit2 = new MockPermit2();
        settlement = new x402BatchSettlement(address(mockPermit2));

        token = new MockERC20("USDC", "USDC", 6);
        erc3009Token = new MockERC3009Token("USDC3009", "USDC3009", 6);

        token.mint(payerWallet.addr, 100_000e6);
        erc3009Token.mint(payerWallet.addr, 100_000e6);

        vm.prank(payerWallet.addr);
        token.approve(address(settlement), type(uint256).max);
        vm.prank(payerWallet.addr);
        token.approve(address(mockPermit2), type(uint256).max);
        mockPermit2.setShouldActuallyTransfer(true);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _makeConfig() internal view returns (x402BatchSettlement.ChannelConfig memory) {
        return x402BatchSettlement.ChannelConfig({
            payer: payerWallet.addr,
            signer: signerWallet.addr,
            receiver: receiverWallet.addr,
            facilitator: facilitatorWallet.addr,
            token: address(token),
            withdrawDelay: WITHDRAW_DELAY,
            salt: bytes32(0)
        });
    }

    function _makeERC3009Config() internal view returns (x402BatchSettlement.ChannelConfig memory) {
        return x402BatchSettlement.ChannelConfig({
            payer: payerWallet.addr,
            signer: signerWallet.addr,
            receiver: receiverWallet.addr,
            facilitator: facilitatorWallet.addr,
            token: address(erc3009Token),
            withdrawDelay: WITHDRAW_DELAY,
            salt: bytes32(0)
        });
    }

    function _channelId(x402BatchSettlement.ChannelConfig memory config) internal pure returns (bytes32) {
        return keccak256(abi.encode(config));
    }

    function _signTypedData(VmSafe.Wallet memory wallet, bytes32 structHash) internal returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", settlement.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wallet, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signVoucher(VmSafe.Wallet memory wallet, bytes32 channelId, uint128 maxClaimableAmount)
        internal
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(settlement.VOUCHER_TYPEHASH(), channelId, maxClaimableAmount));
        return _signTypedData(wallet, structHash);
    }

    function _signCooperativeWithdraw(VmSafe.Wallet memory wallet, bytes32 channelId)
        internal
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(settlement.COOPERATIVE_WITHDRAW_TYPEHASH(), channelId));
        return _signTypedData(wallet, structHash);
    }

    function _directDeposit(x402BatchSettlement.ChannelConfig memory config, uint128 amount) internal {
        vm.prank(config.payer);
        settlement.deposit(config, amount);
    }

    function _depositERC3009(x402BatchSettlement.ChannelConfig memory config, uint128 amount) internal {
        bytes memory sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        settlement.depositWithERC3009(config, amount, 0, block.timestamp + 3600, bytes32(0), sig);
    }

    function _depositPermit2(x402BatchSettlement.ChannelConfig memory config, uint128 amount) internal {
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: config.token, amount: amount}),
            nonce: 0,
            deadline: block.timestamp + 3600
        });
        bytes memory sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        settlement.depositWithPermit2(config, permit, sig);
    }

    function _makeVoucher(
        x402BatchSettlement.ChannelConfig memory config,
        uint128 maxClaimableAmount,
        uint128 claimAmount
    ) internal returns (x402BatchSettlement.Voucher memory) {
        bytes32 channelId = _channelId(config);
        bytes memory sig = _signVoucher(signerWallet, channelId, maxClaimableAmount);
        return x402BatchSettlement.Voucher({
            channel: config,
            maxClaimableAmount: maxClaimableAmount,
            claimAmount: claimAmount,
            signature: sig
        });
    }

    // =========================================================================
    // Constructor Tests
    // =========================================================================

    function test_constructor_setsPermit2() public view {
        assertEq(address(settlement.PERMIT2()), address(mockPermit2));
    }

    function test_constructor_revert_zeroPermit2() public {
        vm.expectRevert(x402BatchSettlement.InvalidPermit2Address.selector);
        new x402BatchSettlement(address(0));
    }

    // =========================================================================
    // Direct Deposit Tests
    // =========================================================================

    function test_deposit_success() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);

        vm.expectEmit(true, false, false, true);
        emit ChannelCreated(channelId, config);
        vm.expectEmit(true, false, false, true);
        emit Deposited(channelId, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);

        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.balance, DEPOSIT_AMOUNT);
        assertEq(ch.totalClaimed, 0);
    }

    function test_deposit_topUp() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);

        _directDeposit(config, DEPOSIT_AMOUNT);
        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.balance, DEPOSIT_AMOUNT * 2);
    }

    function test_deposit_revert_notPayer() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        vm.prank(otherWallet.addr);
        vm.expectRevert(x402BatchSettlement.InvalidChannel.selector);
        settlement.deposit(config, DEPOSIT_AMOUNT);
    }

    function test_deposit_revert_zeroAmount() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.ZeroDeposit.selector);
        settlement.deposit(config, 0);
    }

    function test_deposit_revert_zeroSigner() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        config.signer = address(0);
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.InvalidSigner.selector);
        settlement.deposit(config, DEPOSIT_AMOUNT);
    }

    function test_deposit_revert_withdrawDelayTooLow() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        config.withdrawDelay = 1;
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.WithdrawDelayOutOfRange.selector);
        settlement.deposit(config, DEPOSIT_AMOUNT);
    }

    function test_deposit_revert_withdrawDelayTooHigh() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        config.withdrawDelay = uint40(31 days);
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.WithdrawDelayOutOfRange.selector);
        settlement.deposit(config, DEPOSIT_AMOUNT);
    }

    function test_deposit_revert_zeroReceiver() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        config.receiver = address(0);
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.InvalidChannel.selector);
        settlement.deposit(config, DEPOSIT_AMOUNT);
    }

    function test_deposit_revert_zeroFacilitator() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        config.facilitator = address(0);
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.InvalidChannel.selector);
        settlement.deposit(config, DEPOSIT_AMOUNT);
    }

    function test_deposit_revert_zeroToken() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        config.token = address(0);
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.InvalidChannel.selector);
        settlement.deposit(config, DEPOSIT_AMOUNT);
    }

    function test_deposit_revert_overflow() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        token.mint(payerWallet.addr, type(uint128).max);
        _directDeposit(config, type(uint128).max);

        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.DepositOverflow.selector);
        settlement.deposit(config, 1);
    }

    function test_deposit_cancelsPendingWithdrawal() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);

        _directDeposit(config, DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.WithdrawalState memory ws = settlement.getPendingWithdrawal(channelId);
        assertGt(ws.initiatedAt, 0);

        _directDeposit(config, DEPOSIT_AMOUNT);

        ws = settlement.getPendingWithdrawal(channelId);
        assertEq(ws.initiatedAt, 0);
        assertEq(ws.amount, 0);
    }

    // =========================================================================
    // ERC-3009 Deposit Tests
    // =========================================================================

    function test_depositWithERC3009_success() public {
        x402BatchSettlement.ChannelConfig memory config = _makeERC3009Config();
        bytes32 channelId = _channelId(config);

        _depositERC3009(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.balance, DEPOSIT_AMOUNT);
    }

    function test_depositWithERC3009_revert_zeroAmount() public {
        x402BatchSettlement.ChannelConfig memory config = _makeERC3009Config();
        bytes memory sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        vm.expectRevert(x402BatchSettlement.ZeroDeposit.selector);
        settlement.depositWithERC3009(config, 0, 0, block.timestamp + 3600, bytes32(0), sig);
    }

    function test_depositWithERC3009_revert_zeroPayer() public {
        x402BatchSettlement.ChannelConfig memory config = _makeERC3009Config();
        config.payer = address(0);
        bytes memory sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        vm.expectRevert(x402BatchSettlement.InvalidChannel.selector);
        settlement.depositWithERC3009(config, DEPOSIT_AMOUNT, 0, block.timestamp + 3600, bytes32(0), sig);
    }

    // =========================================================================
    // Permit2 Deposit Tests
    // =========================================================================

    function test_depositWithPermit2_success() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);

        _depositPermit2(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.balance, DEPOSIT_AMOUNT);
    }

    function test_depositWithPermit2_revert_zeroAmount() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: config.token, amount: 0}),
            nonce: 0,
            deadline: block.timestamp + 3600
        });
        bytes memory sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        vm.expectRevert(x402BatchSettlement.ZeroDeposit.selector);
        settlement.depositWithPermit2(config, permit, sig);
    }

    function test_depositWithPermit2_revert_amountOverflow() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: config.token, amount: uint256(type(uint128).max) + 1}),
            nonce: 0,
            deadline: block.timestamp + 3600
        });
        bytes memory sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        vm.expectRevert(x402BatchSettlement.DepositOverflow.selector);
        settlement.depositWithPermit2(config, permit, sig);
    }

    function test_depositWithPermit2_revert_tokenMismatch() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        ISignatureTransfer.PermitTransferFrom memory permit = ISignatureTransfer.PermitTransferFrom({
            permitted: ISignatureTransfer.TokenPermissions({token: address(erc3009Token), amount: DEPOSIT_AMOUNT}),
            nonce: 0,
            deadline: block.timestamp + 3600
        });
        bytes memory sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));

        vm.expectRevert(x402BatchSettlement.InvalidChannel.selector);
        settlement.depositWithPermit2(config, permit, sig);
    }

    // =========================================================================
    // Claim Tests
    // =========================================================================

    function test_claim_single() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);

        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, CLAIM_AMOUNT, CLAIM_AMOUNT);

        vm.expectEmit(true, false, false, true);
        emit Claimed(channelId, CLAIM_AMOUNT, CLAIM_AMOUNT);

        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.totalClaimed, CLAIM_AMOUNT);

        x402BatchSettlement.ReceiverState memory rs = settlement.getReceiver(receiverWallet.addr, address(token));
        assertEq(rs.totalClaimed, CLAIM_AMOUNT);
    }

    function test_claim_batch() public {
        x402BatchSettlement.ChannelConfig memory config1 = _makeConfig();
        x402BatchSettlement.ChannelConfig memory config2 = _makeConfig();
        config2.salt = bytes32(uint256(1));

        _directDeposit(config1, DEPOSIT_AMOUNT);
        _directDeposit(config2, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](2);
        vouchers[0] = _makeVoucher(config1, CLAIM_AMOUNT, CLAIM_AMOUNT);
        vouchers[1] = _makeVoucher(config2, CLAIM_AMOUNT * 2, CLAIM_AMOUNT * 2);

        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        x402BatchSettlement.ReceiverState memory rs = settlement.getReceiver(receiverWallet.addr, address(token));
        assertEq(rs.totalClaimed, CLAIM_AMOUNT * 3);
    }

    function test_claim_cumulative() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();

        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, 200e6, CLAIM_AMOUNT);

        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        vouchers[0] = _makeVoucher(config, 200e6, CLAIM_AMOUNT);

        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        bytes32 channelId = _channelId(config);
        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.totalClaimed, 200e6);
    }

    function test_claim_revert_notFacilitator() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, CLAIM_AMOUNT, CLAIM_AMOUNT);

        vm.prank(otherWallet.addr);
        vm.expectRevert(x402BatchSettlement.NotFacilitator.selector);
        settlement.claim(vouchers);
    }

    function test_claim_revert_exceedsCeiling() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, CLAIM_AMOUNT, CLAIM_AMOUNT + 1);

        vm.prank(facilitatorWallet.addr);
        vm.expectRevert(x402BatchSettlement.ClaimExceedsCeiling.selector);
        settlement.claim(vouchers);
    }

    function test_claim_revert_exceedsBalance() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, CLAIM_AMOUNT / 2);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, CLAIM_AMOUNT, CLAIM_AMOUNT);

        vm.prank(facilitatorWallet.addr);
        vm.expectRevert(x402BatchSettlement.ClaimExceedsBalance.selector);
        settlement.claim(vouchers);
    }

    function test_claim_revert_wrongSigner() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, DEPOSIT_AMOUNT);

        bytes32 channelId = _channelId(config);
        bytes memory badSig = _signVoucher(otherWallet, channelId, CLAIM_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = x402BatchSettlement.Voucher({
            channel: config,
            maxClaimableAmount: CLAIM_AMOUNT,
            claimAmount: CLAIM_AMOUNT,
            signature: badSig
        });

        vm.prank(facilitatorWallet.addr);
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.claim(vouchers);
    }

    function test_claim_revert_malformedSignature() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = x402BatchSettlement.Voucher({
            channel: config,
            maxClaimableAmount: CLAIM_AMOUNT,
            claimAmount: CLAIM_AMOUNT,
            signature: hex"0000"
        });

        vm.prank(facilitatorWallet.addr);
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.claim(vouchers);
    }

    // =========================================================================
    // Settle Tests
    // =========================================================================

    function test_settle_success() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();

        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, CLAIM_AMOUNT, CLAIM_AMOUNT);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        uint256 balBefore = token.balanceOf(receiverWallet.addr);

        vm.expectEmit(true, true, false, true);
        emit Settled(receiverWallet.addr, address(token), CLAIM_AMOUNT);
        settlement.settle(receiverWallet.addr, address(token));

        assertEq(token.balanceOf(receiverWallet.addr), balBefore + CLAIM_AMOUNT);

        x402BatchSettlement.ReceiverState memory rs = settlement.getReceiver(receiverWallet.addr, address(token));
        assertEq(rs.totalSettled, CLAIM_AMOUNT);
    }

    function test_settle_sweepsAcrossChannels() public {
        x402BatchSettlement.ChannelConfig memory config1 = _makeConfig();
        x402BatchSettlement.ChannelConfig memory config2 = _makeConfig();
        config2.salt = bytes32(uint256(1));

        _directDeposit(config1, DEPOSIT_AMOUNT);
        _directDeposit(config2, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory v1 = new x402BatchSettlement.Voucher[](1);
        v1[0] = _makeVoucher(config1, CLAIM_AMOUNT, CLAIM_AMOUNT);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(v1);

        x402BatchSettlement.Voucher[] memory v2 = new x402BatchSettlement.Voucher[](1);
        v2[0] = _makeVoucher(config2, CLAIM_AMOUNT * 2, CLAIM_AMOUNT * 2);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(v2);

        uint256 balBefore = token.balanceOf(receiverWallet.addr);
        settlement.settle(receiverWallet.addr, address(token));
        assertEq(token.balanceOf(receiverWallet.addr), balBefore + CLAIM_AMOUNT * 3);
    }

    function test_settle_revert_nothingToSettle() public {
        vm.expectRevert(x402BatchSettlement.NothingToSettle.selector);
        settlement.settle(receiverWallet.addr, address(token));
    }

    // =========================================================================
    // Timed Withdrawal Tests
    // =========================================================================

    function test_initiateWithdraw_success() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);
        _directDeposit(config, DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        vm.expectEmit(true, false, false, true);
        emit WithdrawInitiated(channelId, DEPOSIT_AMOUNT, uint40(block.timestamp) + WITHDRAW_DELAY);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.WithdrawalState memory ws = settlement.getPendingWithdrawal(channelId);
        assertEq(ws.amount, DEPOSIT_AMOUNT);
        assertEq(ws.initiatedAt, uint40(block.timestamp));
    }

    function test_initiateWithdraw_capsAtAvailable() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);
        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, CLAIM_AMOUNT, CLAIM_AMOUNT);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        vm.prank(payerWallet.addr);
        settlement.initiateWithdraw(config, type(uint128).max);

        x402BatchSettlement.WithdrawalState memory ws = settlement.getPendingWithdrawal(channelId);
        assertEq(ws.amount, DEPOSIT_AMOUNT - CLAIM_AMOUNT);
    }

    function test_initiateWithdraw_revert_notPayer() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, DEPOSIT_AMOUNT);

        vm.prank(otherWallet.addr);
        vm.expectRevert(x402BatchSettlement.InvalidChannel.selector);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);
    }

    function test_initiateWithdraw_revert_nothingToWithdraw_noBalance() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.NothingToWithdraw.selector);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);
    }

    function test_initiateWithdraw_revert_nothingToWithdraw_zeroAmount() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, DEPOSIT_AMOUNT);
        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.NothingToWithdraw.selector);
        settlement.initiateWithdraw(config, 0);
    }

    function test_initiateWithdraw_revert_alreadyPending() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        vm.expectRevert(x402BatchSettlement.WithdrawalAlreadyPending.selector);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);
    }

    function test_finalizeWithdraw_success() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);
        _directDeposit(config, DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);

        vm.warp(block.timestamp + WITHDRAW_DELAY + 1);

        uint256 balBefore = token.balanceOf(payerWallet.addr);

        vm.expectEmit(true, false, false, true);
        emit WithdrawFinalized(channelId, DEPOSIT_AMOUNT);
        settlement.finalizeWithdraw(config);

        assertEq(token.balanceOf(payerWallet.addr), balBefore + DEPOSIT_AMOUNT);

        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.balance, 0);
    }

    function test_finalizeWithdraw_revert_notPending() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        vm.expectRevert(x402BatchSettlement.WithdrawalNotPending.selector);
        settlement.finalizeWithdraw(config);
    }

    function test_finalizeWithdraw_revert_delayNotElapsed() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);

        vm.expectRevert(x402BatchSettlement.WithdrawDelayNotElapsed.selector);
        settlement.finalizeWithdraw(config);
    }

    function test_finalizeWithdraw_zeroAmount_afterFullClaim() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        _directDeposit(config, DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        vm.warp(block.timestamp + WITHDRAW_DELAY + 1);
        uint256 balBefore = token.balanceOf(payerWallet.addr);
        settlement.finalizeWithdraw(config);

        assertEq(token.balanceOf(payerWallet.addr), balBefore);
    }

    function test_finalizeWithdraw_capsIfClaimedDuringDelay() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);
        _directDeposit(config, DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, 500e6, 500e6);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        vm.warp(block.timestamp + WITHDRAW_DELAY + 1);
        settlement.finalizeWithdraw(config);

        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.balance, 500e6);
    }

    // =========================================================================
    // Cooperative Withdrawal Tests
    // =========================================================================

    function test_cooperativeWithdraw_success() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);
        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, CLAIM_AMOUNT, CLAIM_AMOUNT);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        bytes memory sig = _signCooperativeWithdraw(receiverWallet, channelId);
        uint256 balBefore = token.balanceOf(payerWallet.addr);

        vm.expectEmit(true, false, false, true);
        emit WithdrawFinalized(channelId, DEPOSIT_AMOUNT - CLAIM_AMOUNT);
        settlement.cooperativeWithdraw(config, sig);

        assertEq(token.balanceOf(payerWallet.addr), balBefore + DEPOSIT_AMOUNT - CLAIM_AMOUNT);

        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.balance, ch.totalClaimed);
    }

    function test_cooperativeWithdraw_clearsPendingWithdrawal() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);
        _directDeposit(config, DEPOSIT_AMOUNT);

        vm.prank(payerWallet.addr);
        settlement.initiateWithdraw(config, DEPOSIT_AMOUNT);

        bytes memory sig = _signCooperativeWithdraw(receiverWallet, channelId);
        settlement.cooperativeWithdraw(config, sig);

        x402BatchSettlement.WithdrawalState memory ws = settlement.getPendingWithdrawal(channelId);
        assertEq(ws.initiatedAt, 0);
    }

    function test_cooperativeWithdraw_zeroRefund() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);
        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        bytes memory sig = _signCooperativeWithdraw(receiverWallet, channelId);
        uint256 balBefore = token.balanceOf(payerWallet.addr);

        settlement.cooperativeWithdraw(config, sig);

        assertEq(token.balanceOf(payerWallet.addr), balBefore);
    }

    function test_cooperativeWithdraw_revert_wrongSignature() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);
        _directDeposit(config, DEPOSIT_AMOUNT);

        bytes memory badSig = _signCooperativeWithdraw(otherWallet, channelId);
        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.cooperativeWithdraw(config, badSig);
    }

    // =========================================================================
    // Migration Tests
    // =========================================================================

    function test_migrateChannel_success() public {
        x402BatchSettlement.ChannelConfig memory oldConfig = _makeConfig();
        x402BatchSettlement.ChannelConfig memory newConfig = _makeConfig();
        newConfig.salt = bytes32(uint256(1));
        newConfig.signer = otherWallet.addr;

        bytes32 oldChannelId = _channelId(oldConfig);
        bytes32 newChannelId = _channelId(newConfig);

        _directDeposit(oldConfig, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(oldConfig, CLAIM_AMOUNT, CLAIM_AMOUNT);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        bytes memory sig = _signCooperativeWithdraw(receiverWallet, oldChannelId);

        vm.expectEmit(true, true, false, true);
        emit ChannelMigrated(oldChannelId, newChannelId, DEPOSIT_AMOUNT - CLAIM_AMOUNT);
        settlement.migrateChannel(oldConfig, newConfig, sig);

        x402BatchSettlement.ChannelState memory oldCh = settlement.getChannel(oldChannelId);
        assertEq(oldCh.balance, oldCh.totalClaimed);

        x402BatchSettlement.ChannelState memory newCh = settlement.getChannel(newChannelId);
        assertEq(newCh.balance, DEPOSIT_AMOUNT - CLAIM_AMOUNT);
    }

    function test_migrateChannel_zeroRefund() public {
        x402BatchSettlement.ChannelConfig memory oldConfig = _makeConfig();
        x402BatchSettlement.ChannelConfig memory newConfig = _makeConfig();
        newConfig.salt = bytes32(uint256(1));

        _directDeposit(oldConfig, DEPOSIT_AMOUNT);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(oldConfig, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        bytes32 oldChannelId = _channelId(oldConfig);
        bytes memory sig = _signCooperativeWithdraw(receiverWallet, oldChannelId);
        settlement.migrateChannel(oldConfig, newConfig, sig);

        bytes32 newChannelId = _channelId(newConfig);
        x402BatchSettlement.ChannelState memory newCh = settlement.getChannel(newChannelId);
        assertEq(newCh.balance, 0);
    }

    function test_migrateChannel_revert_wrongReceiverSignature() public {
        x402BatchSettlement.ChannelConfig memory oldConfig = _makeConfig();
        x402BatchSettlement.ChannelConfig memory newConfig = _makeConfig();
        newConfig.salt = bytes32(uint256(1));

        _directDeposit(oldConfig, DEPOSIT_AMOUNT);

        bytes32 oldChannelId = _channelId(oldConfig);
        bytes memory badSig = _signCooperativeWithdraw(otherWallet, oldChannelId);

        vm.expectRevert(x402BatchSettlement.InvalidSignature.selector);
        settlement.migrateChannel(oldConfig, newConfig, badSig);
    }

    function test_migrateChannel_revert_payerMismatch() public {
        x402BatchSettlement.ChannelConfig memory oldConfig = _makeConfig();
        x402BatchSettlement.ChannelConfig memory newConfig = _makeConfig();
        newConfig.payer = otherWallet.addr;

        bytes32 oldChannelId = _channelId(oldConfig);
        _directDeposit(oldConfig, DEPOSIT_AMOUNT);

        bytes memory sig = _signCooperativeWithdraw(receiverWallet, oldChannelId);

        vm.expectRevert(x402BatchSettlement.PayerMismatch.selector);
        settlement.migrateChannel(oldConfig, newConfig, sig);
    }

    function test_migrateChannel_revert_tokenMismatch() public {
        x402BatchSettlement.ChannelConfig memory oldConfig = _makeConfig();
        x402BatchSettlement.ChannelConfig memory newConfig = _makeConfig();
        newConfig.token = address(erc3009Token);

        bytes32 oldChannelId = _channelId(oldConfig);
        _directDeposit(oldConfig, DEPOSIT_AMOUNT);

        bytes memory sig = _signCooperativeWithdraw(receiverWallet, oldChannelId);

        vm.expectRevert(x402BatchSettlement.TokenMismatch.selector);
        settlement.migrateChannel(oldConfig, newConfig, sig);
    }

    // =========================================================================
    // View Function Tests
    // =========================================================================

    function test_getChannelId_deterministic() public view {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 id1 = settlement.getChannelId(config);
        bytes32 id2 = settlement.getChannelId(config);
        assertEq(id1, id2);
        assertEq(id1, _channelId(config));
    }

    function test_differentSalt_differentChannelId() public view {
        x402BatchSettlement.ChannelConfig memory config1 = _makeConfig();
        x402BatchSettlement.ChannelConfig memory config2 = _makeConfig();
        config2.salt = bytes32(uint256(1));

        assertNotEq(settlement.getChannelId(config1), settlement.getChannelId(config2));
    }

    function test_getVoucherDigest_matches() public view {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);

        bytes32 expected = keccak256(
            abi.encodePacked(
                "\x19\x01",
                settlement.domainSeparator(),
                keccak256(abi.encode(settlement.VOUCHER_TYPEHASH(), channelId, uint128(100)))
            )
        );
        assertEq(settlement.getVoucherDigest(channelId, 100), expected);
    }

    function test_getCooperativeWithdrawDigest_matches() public view {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);

        bytes32 expected = keccak256(
            abi.encodePacked(
                "\x19\x01",
                settlement.domainSeparator(),
                keccak256(abi.encode(settlement.COOPERATIVE_WITHDRAW_TYPEHASH(), channelId))
            )
        );
        assertEq(settlement.getCooperativeWithdrawDigest(channelId), expected);
    }

    // =========================================================================
    // Edge Case Tests
    // =========================================================================

    function test_redeposit_afterFullWithdraw() public {
        x402BatchSettlement.ChannelConfig memory config = _makeConfig();
        bytes32 channelId = _channelId(config);

        _directDeposit(config, DEPOSIT_AMOUNT);

        bytes memory sig = _signCooperativeWithdraw(receiverWallet, channelId);
        settlement.cooperativeWithdraw(config, sig);

        _directDeposit(config, DEPOSIT_AMOUNT);

        x402BatchSettlement.ChannelState memory ch = settlement.getChannel(channelId);
        assertEq(ch.balance, DEPOSIT_AMOUNT);
    }

    function test_crossChannel_isolation() public {
        x402BatchSettlement.ChannelConfig memory config1 = _makeConfig();
        x402BatchSettlement.ChannelConfig memory config2 = _makeConfig();
        config2.salt = bytes32(uint256(99));

        _directDeposit(config1, DEPOSIT_AMOUNT);
        _directDeposit(config2, DEPOSIT_AMOUNT / 2);

        x402BatchSettlement.Voucher[] memory vouchers = new x402BatchSettlement.Voucher[](1);
        vouchers[0] = _makeVoucher(config1, CLAIM_AMOUNT, CLAIM_AMOUNT);
        vm.prank(facilitatorWallet.addr);
        settlement.claim(vouchers);

        bytes32 channelId2 = _channelId(config2);
        x402BatchSettlement.ChannelState memory ch2 = settlement.getChannel(channelId2);
        assertEq(ch2.totalClaimed, 0);
    }
}
