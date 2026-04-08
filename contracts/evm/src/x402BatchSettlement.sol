// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ISignatureTransfer} from "./interfaces/ISignatureTransfer.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title x402BatchSettlement
/// @notice Stateless unidirectional payment channel contract for the x402 `batch-settlement` scheme on EVM.
/// @dev Channel identity is derived from an immutable ChannelConfig struct:
///      `channelId = keccak256(abi.encode(channelConfig))`.
///      Deployed at the same address across all supported EVM chains using CREATE2.
/// @author x402 Protocol
contract x402BatchSettlement is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Structs
    // =========================================================================

    struct ChannelConfig {
        address payer;
        address signer;
        address receiver;
        address facilitator;
        address token;
        uint40 withdrawDelay;
        bytes32 salt;
    }

    struct ChannelState {
        uint128 balance;
        uint128 totalClaimed;
    }

    struct WithdrawalState {
        uint128 amount;
        uint40 initiatedAt;
    }

    struct ReceiverState {
        uint128 totalClaimed;
        uint128 totalSettled;
    }

    struct Voucher {
        ChannelConfig channel;
        uint128 maxClaimableAmount;
        uint128 claimAmount;
        bytes signature;
    }

    struct DepositWitness {
        bytes32 channelId;
    }

    // =========================================================================
    // Constants
    // =========================================================================

    uint40 public constant MIN_WITHDRAW_DELAY = 15 minutes;
    uint40 public constant MAX_WITHDRAW_DELAY = 30 days;

    // =========================================================================
    // Constants — EIP-712 Type Hashes
    // =========================================================================

    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("Voucher(bytes32 channelId,uint128 maxClaimableAmount)");

    bytes32 public constant COOPERATIVE_WITHDRAW_TYPEHASH =
        keccak256("CooperativeWithdraw(bytes32 channelId)");

    string public constant DEPOSIT_WITNESS_TYPE_STRING =
        "DepositWitness witness)TokenPermissions(address token,uint256 amount)DepositWitness(bytes32 channelId)";

    bytes32 public constant DEPOSIT_WITNESS_TYPEHASH = keccak256("DepositWitness(bytes32 channelId)");

    // =========================================================================
    // Immutables
    // =========================================================================

    ISignatureTransfer public immutable PERMIT2;

    // =========================================================================
    // Storage
    // =========================================================================

    mapping(bytes32 channelId => ChannelState) public channels;
    mapping(bytes32 channelId => WithdrawalState) public pendingWithdrawals;
    mapping(address receiver => mapping(address token => ReceiverState)) public receivers;

    // =========================================================================
    // Events
    // =========================================================================

    event ChannelCreated(bytes32 indexed channelId, ChannelConfig config);
    event Deposited(bytes32 indexed channelId, uint128 amount, uint128 newBalance);
    event Claimed(bytes32 indexed channelId, uint128 claimAmount, uint128 newTotalClaimed);
    event Settled(address indexed receiver, address indexed token, uint128 amount);
    event WithdrawInitiated(bytes32 indexed channelId, uint128 amount, uint40 finalizeAfter);
    event WithdrawFinalized(bytes32 indexed channelId, uint128 amount);
    event ChannelMigrated(bytes32 indexed oldChannelId, bytes32 indexed newChannelId, uint128 migratedAmount);

    // =========================================================================
    // Errors
    // =========================================================================

    error InvalidChannel();
    error InvalidSigner();
    error ZeroDeposit();
    error DepositOverflow();
    error InvalidSignature();
    error NotFacilitator();
    error ClaimExceedsCeiling();
    error ClaimExceedsBalance();
    error NothingToSettle();
    error WithdrawalAlreadyPending();
    error WithdrawalNotPending();
    error WithdrawDelayNotElapsed();
    error NothingToWithdraw();
    error WithdrawDelayOutOfRange();
    error PayerMismatch();
    error TokenMismatch();
    error InvalidPermit2Address();

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor(address _permit2) EIP712("x402 Batch Settlement", "1") {
        if (_permit2 == address(0)) revert InvalidPermit2Address();
        PERMIT2 = ISignatureTransfer(_permit2);
    }

    // =========================================================================
    // Deposits
    // =========================================================================

    /// @notice Direct deposit via ERC-20 transferFrom. Caller must be the payer.
    function deposit(ChannelConfig calldata config, uint128 amount) external nonReentrant {
        if (msg.sender != config.payer) revert InvalidChannel();
        _validateConfig(config);
        if (amount == 0) revert ZeroDeposit();

        bytes32 channelId = getChannelId(config);
        _applyDeposit(channelId, config, amount);

        IERC20(config.token).safeTransferFrom(config.payer, address(this), amount);
    }

    /// @notice Gasless deposit via ERC-3009 receiveWithAuthorization.
    function depositWithERC3009(
        ChannelConfig calldata config,
        uint128 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant {
        _validateConfig(config);
        if (amount == 0) revert ZeroDeposit();

        bytes32 channelId = getChannelId(config);
        _applyDeposit(channelId, config, amount);

        IERC3009(config.token).receiveWithAuthorization(
            config.payer, address(this), amount, validAfter, validBefore, nonce, signature
        );
    }

    /// @notice Gasless deposit via Permit2 (ISignatureTransfer).
    function depositWithPermit2(
        ChannelConfig calldata config,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external nonReentrant {
        _validateConfig(config);
        if (config.token != permit.permitted.token) revert InvalidChannel();

        uint128 amount = _safeToUint128(permit.permitted.amount);
        if (amount == 0) revert ZeroDeposit();

        bytes32 channelId = getChannelId(config);
        _applyDeposit(channelId, config, amount);

        bytes32 witnessHash = keccak256(abi.encode(DEPOSIT_WITNESS_TYPEHASH, channelId));

        PERMIT2.permitWitnessTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: permit.permitted.amount}),
            config.payer,
            witnessHash,
            DEPOSIT_WITNESS_TYPE_STRING,
            signature
        );
    }

    // =========================================================================
    // Claim & Settle
    // =========================================================================

    /// @notice Batch-validate vouchers and update channel accounting. No token transfer.
    function claim(Voucher[] calldata vouchers) external {
        for (uint256 i = 0; i < vouchers.length; ++i) {
            Voucher calldata v = vouchers[i];
            if (msg.sender != v.channel.facilitator) revert NotFacilitator();

            bytes32 channelId = getChannelId(v.channel);
            ChannelState storage ch = channels[channelId];

            uint128 newTotalClaimed = ch.totalClaimed + v.claimAmount;
            if (newTotalClaimed > v.maxClaimableAmount) revert ClaimExceedsCeiling();
            if (newTotalClaimed > ch.balance) revert ClaimExceedsBalance();

            bytes32 structHash = keccak256(abi.encode(VOUCHER_TYPEHASH, channelId, v.maxClaimableAmount));
            bytes32 digest = _hashTypedDataV4(structHash);
            (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, v.signature);
            if (err != ECDSA.RecoverError.NoError || recovered != v.channel.signer) {
                revert InvalidSignature();
            }

            ch.totalClaimed = newTotalClaimed;
            receivers[v.channel.receiver][v.channel.token].totalClaimed += v.claimAmount;

            emit Claimed(channelId, v.claimAmount, newTotalClaimed);
        }
    }

    /// @notice Transfer all claimed-but-unsettled funds to the receiver.
    function settle(address receiver, address token) external nonReentrant {
        ReceiverState storage rs = receivers[receiver][token];
        uint128 amount = rs.totalClaimed - rs.totalSettled;
        if (amount == 0) revert NothingToSettle();

        rs.totalSettled = rs.totalClaimed;

        IERC20(token).safeTransfer(receiver, amount);

        emit Settled(receiver, token, amount);
    }

    // =========================================================================
    // Withdrawal Flow
    // =========================================================================

    /// @notice Start the withdrawal countdown. Only the payer can call.
    function initiateWithdraw(ChannelConfig calldata config, uint128 amount) external {
        if (msg.sender != config.payer) revert InvalidChannel();

        bytes32 channelId = getChannelId(config);
        ChannelState storage ch = channels[channelId];

        uint128 available = ch.balance - ch.totalClaimed;
        if (available == 0 || amount == 0) revert NothingToWithdraw();

        WithdrawalState storage ws = pendingWithdrawals[channelId];
        if (ws.initiatedAt != 0) revert WithdrawalAlreadyPending();

        uint128 withdrawAmount = amount > available ? available : amount;
        ws.amount = withdrawAmount;
        ws.initiatedAt = uint40(block.timestamp);

        uint40 finalizeAfter = uint40(block.timestamp) + config.withdrawDelay;
        emit WithdrawInitiated(channelId, withdrawAmount, finalizeAfter);
    }

    /// @notice Finalize withdrawal after delay has elapsed. Anyone can call.
    function finalizeWithdraw(ChannelConfig calldata config) external nonReentrant {
        bytes32 channelId = getChannelId(config);
        WithdrawalState storage ws = pendingWithdrawals[channelId];

        if (ws.initiatedAt == 0) revert WithdrawalNotPending();
        if (block.timestamp < uint256(ws.initiatedAt) + uint256(config.withdrawDelay)) {
            revert WithdrawDelayNotElapsed();
        }

        ChannelState storage ch = channels[channelId];
        uint128 available = ch.balance - ch.totalClaimed;
        uint128 withdrawAmount = ws.amount > available ? available : ws.amount;

        ws.amount = 0;
        ws.initiatedAt = 0;
        ch.balance -= withdrawAmount;

        emit WithdrawFinalized(channelId, withdrawAmount);

        if (withdrawAmount > 0) {
            IERC20(config.token).safeTransfer(config.payer, withdrawAmount);
        }
    }

    /// @notice Instant cooperative withdrawal signed by the receiver.
    function cooperativeWithdraw(
        ChannelConfig calldata config,
        bytes calldata receiverSignature
    ) external nonReentrant {
        bytes32 channelId = getChannelId(config);

        _verifyCooperativeWithdraw(channelId, config.receiver, receiverSignature);

        ChannelState storage ch = channels[channelId];
        uint128 refund = ch.balance - ch.totalClaimed;
        ch.balance = ch.totalClaimed;

        _clearPendingWithdrawal(channelId);

        emit WithdrawFinalized(channelId, refund);

        if (refund > 0) {
            IERC20(config.token).safeTransfer(config.payer, refund);
        }
    }

    // =========================================================================
    // Channel Migration
    // =========================================================================

    /// @notice Atomic cooperative-withdraw from old channel + deposit into new channel.
    function migrateChannel(
        ChannelConfig calldata oldConfig,
        ChannelConfig calldata newConfig,
        bytes calldata receiverSignature
    ) external nonReentrant {
        if (oldConfig.payer != newConfig.payer) revert PayerMismatch();
        if (oldConfig.token != newConfig.token) revert TokenMismatch();
        _validateConfig(newConfig);

        bytes32 oldChannelId = getChannelId(oldConfig);

        _verifyCooperativeWithdraw(oldChannelId, oldConfig.receiver, receiverSignature);

        ChannelState storage oldCh = channels[oldChannelId];
        uint128 refund = oldCh.balance - oldCh.totalClaimed;
        oldCh.balance = oldCh.totalClaimed;

        _clearPendingWithdrawal(oldChannelId);

        if (refund > 0) {
            bytes32 newChannelId = getChannelId(newConfig);
            _applyDeposit(newChannelId, newConfig, refund);
        }

        emit ChannelMigrated(oldChannelId, getChannelId(newConfig), refund);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    function getChannelId(ChannelConfig calldata config) public pure returns (bytes32) {
        return keccak256(abi.encode(config));
    }

    function getChannel(bytes32 channelId) external view returns (ChannelState memory) {
        return channels[channelId];
    }

    function getPendingWithdrawal(bytes32 channelId) external view returns (WithdrawalState memory) {
        return pendingWithdrawals[channelId];
    }

    function getReceiver(address receiver, address token) external view returns (ReceiverState memory) {
        return receivers[receiver][token];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getVoucherDigest(bytes32 channelId, uint128 maxClaimableAmount) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, channelId, maxClaimableAmount)));
    }

    function getCooperativeWithdrawDigest(bytes32 channelId) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(COOPERATIVE_WITHDRAW_TYPEHASH, channelId)));
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    function _validateConfig(ChannelConfig calldata config) internal pure {
        if (config.payer == address(0)) revert InvalidChannel();
        if (config.signer == address(0)) revert InvalidSigner();
        if (config.receiver == address(0)) revert InvalidChannel();
        if (config.facilitator == address(0)) revert InvalidChannel();
        if (config.token == address(0)) revert InvalidChannel();
        if (config.withdrawDelay < MIN_WITHDRAW_DELAY || config.withdrawDelay > MAX_WITHDRAW_DELAY) {
            revert WithdrawDelayOutOfRange();
        }
    }

    function _applyDeposit(bytes32 channelId, ChannelConfig calldata config, uint128 amount) internal {
        ChannelState storage ch = channels[channelId];

        bool isNew = ch.balance == 0 && ch.totalClaimed == 0;

        if (amount > type(uint128).max - ch.balance) revert DepositOverflow();
        ch.balance += amount;

        if (pendingWithdrawals[channelId].initiatedAt != 0) {
            pendingWithdrawals[channelId].amount = 0;
            pendingWithdrawals[channelId].initiatedAt = 0;
        }

        if (isNew) {
            emit ChannelCreated(channelId, config);
        }
        emit Deposited(channelId, amount, ch.balance);
    }

    function _verifyCooperativeWithdraw(
        bytes32 channelId,
        address receiver,
        bytes calldata receiverSignature
    ) internal view {
        bytes32 structHash = keccak256(abi.encode(COOPERATIVE_WITHDRAW_TYPEHASH, channelId));
        bytes32 digest = _hashTypedDataV4(structHash);
        if (!SignatureChecker.isValidSignatureNow(receiver, digest, receiverSignature)) {
            revert InvalidSignature();
        }
    }

    function _clearPendingWithdrawal(bytes32 channelId) internal {
        WithdrawalState storage ws = pendingWithdrawals[channelId];
        if (ws.initiatedAt != 0) {
            ws.amount = 0;
            ws.initiatedAt = 0;
        }
    }

    function _safeToUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) revert DepositOverflow();
        return uint128(value);
    }
}
