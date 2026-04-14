// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {
    SignatureChecker
} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {
    ReentrancyGuardTransient
} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IDepositCollector} from "./interfaces/IDepositCollector.sol";

/// @title x402BatchSettlement
/// @notice Stateless unidirectional payment channel contract for the x402 `batch-settlement` scheme on EVM.
/// @dev Channel identity is derived from an immutable ChannelConfig struct:
///      `channelId = keccak256(abi.encode(channelConfig))`.
///      Deployed at the same address across all supported EVM chains using CREATE2.
///      Uses {ReentrancyGuardTransient} (EIP-1153); deploy only on chains with transient storage support.
/// @author x402 Protocol
contract x402BatchSettlement is EIP712, Multicall, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Structs
    // =========================================================================

    struct ChannelConfig {
        address payer;
        address payerAuthorizer;
        address receiver;
        address receiverAuthorizer;
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

    /// @dev The payer-signed data. Does not include claimAmount or signature.
    struct Voucher {
        ChannelConfig channel;
        uint128 maxClaimableAmount;
    }

    /// @dev Wraps a Voucher with the payer's signature and the receiverAuthorizer-determined cumulative claim total.
    ///      Using a cumulative total (rather than a delta) provides natural replay protection:
    ///      replaying a voucher after it's been applied is a no-op.
    struct VoucherClaim {
        Voucher voucher;
        bytes signature;
        uint128 totalClaimed;
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

    bytes32 public constant REFUND_TYPEHASH =
        keccak256("Refund(bytes32 channelId)");

    bytes32 public constant CLAIM_BATCH_TYPEHASH =
        keccak256("ClaimBatch(bytes32 claimsHash)");

    // =========================================================================
    // Storage
    // =========================================================================

    mapping(bytes32 channelId => ChannelState) public channels;
    mapping(bytes32 channelId => WithdrawalState) public pendingWithdrawals;
    mapping(address receiver => mapping(address token => ReceiverState))
        public receivers;

    // =========================================================================
    // Events
    // =========================================================================

    event ChannelCreated(bytes32 indexed channelId, ChannelConfig config);
    event Deposited(
        bytes32 indexed channelId,
        address indexed sender,
        uint128 amount,
        uint128 newBalance
    );
    event Claimed(
        bytes32 indexed channelId,
        address indexed sender,
        uint128 claimAmount,
        uint128 newTotalClaimed
    );
    event Settled(
        address indexed receiver,
        address indexed token,
        address indexed sender,
        uint128 amount
    );
    event Refunded(
        bytes32 indexed channelId,
        address indexed sender,
        uint128 amount
    );
    event WithdrawInitiated(
        bytes32 indexed channelId,
        uint128 amount,
        uint40 finalizeAfter
    );
    event WithdrawFinalized(
        bytes32 indexed channelId,
        uint128 amount,
        address sender
    );

    // =========================================================================
    // Errors
    // =========================================================================

    error InvalidChannel();
    error ZeroDeposit();
    error DepositOverflow();
    error InvalidSignature();
    error NotReceiverAuthorizer();
    error ClaimExceedsCeiling();
    error ClaimExceedsBalance();
    error WithdrawalAlreadyPending();
    error WithdrawalNotPending();
    error WithdrawDelayNotElapsed();
    error NothingToWithdraw();
    error WithdrawDelayOutOfRange();
    error EmptyBatch();
    error DepositCollectionFailed();
    error InvalidCollector();

    // =========================================================================
    // Constructor
    // =========================================================================

    constructor() EIP712("x402 Batch Settlement", "1") {}

    // =========================================================================
    // Deposits
    // =========================================================================

    /// @notice Deposit tokens into a channel using a pluggable collector.
    /// @dev The collector handles the token transfer mechanics. This function verifies
    ///      actual token receipt via balance checks (checks-effects-interactions with post-check).
    /// @param config The immutable channel configuration
    /// @param amount The exact amount of tokens to deposit
    /// @param collector The deposit collector contract address
    /// @param collectorData Opaque bytes forwarded to the collector (signatures, nonces, etc.)
    function deposit(
        ChannelConfig calldata config,
        uint128 amount,
        address collector,
        bytes calldata collectorData
    ) external nonReentrant {
        _validateConfig(config);
        if (amount == 0) revert ZeroDeposit();
        if (collector == address(0)) revert InvalidCollector();

        bytes32 channelId = getChannelId(config);
        ChannelState storage ch = channels[channelId];

        bool isNew = ch.balance == 0 && ch.totalClaimed == 0;

        if (amount > type(uint128).max - ch.balance) revert DepositOverflow();
        ch.balance += amount;

        if (isNew) {
            emit ChannelCreated(channelId, config);
        }
        emit Deposited(channelId, msg.sender, amount, ch.balance);

        uint256 balBefore = IERC20(config.token).balanceOf(address(this));
        IDepositCollector(collector).collect(
            config.payer,
            config.token,
            amount,
            channelId,
            msg.sender,
            collectorData
        );
        uint256 balAfter = IERC20(config.token).balanceOf(address(this));
        if (balAfter != balBefore + amount) revert DepositCollectionFailed();
    }

    // =========================================================================
    // Claim & Settle
    // =========================================================================

    /// @notice Batch-validate voucher claims and update channel accounting.
    ///         Caller must be the receiverAuthorizer for every claim in the batch.
    function claim(
        VoucherClaim[] calldata voucherClaims
    ) external nonReentrant {
        if (voucherClaims.length == 0) revert EmptyBatch();

        for (uint256 i = 0; i < voucherClaims.length; ++i) {
            if (
                msg.sender !=
                voucherClaims[i].voucher.channel.receiverAuthorizer
            ) {
                revert NotReceiverAuthorizer();
            }
            _processVoucherClaim(voucherClaims[i]);
        }
    }

    /// @notice Batch-validate voucher claims with an off-chain receiverAuthorizer signature.
    ///         Anyone can submit. All claims must reference the same receiverAuthorizer.
    function claimWithSignature(
        VoucherClaim[] calldata voucherClaims,
        bytes calldata authorizerSignature
    ) external nonReentrant {
        if (voucherClaims.length == 0) revert EmptyBatch();

        address authorizer = voucherClaims[0]
            .voucher
            .channel
            .receiverAuthorizer;

        bytes32 claimsHash = _computeClaimsHash(voucherClaims);
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_BATCH_TYPEHASH, claimsHash))
        );
        if (
            !SignatureChecker.isValidSignatureNow(
                authorizer,
                digest,
                authorizerSignature
            )
        ) {
            revert InvalidSignature();
        }

        for (uint256 i = 0; i < voucherClaims.length; ++i) {
            if (
                voucherClaims[i].voucher.channel.receiverAuthorizer !=
                authorizer
            ) {
                revert NotReceiverAuthorizer();
            }
            _processVoucherClaim(voucherClaims[i]);
        }
    }

    /// @notice Transfer all claimed-but-unsettled funds to the receiver. Permissionless.
    function settle(address receiver, address token) external nonReentrant {
        ReceiverState storage rs = receivers[receiver][token];
        uint128 amount = rs.totalClaimed - rs.totalSettled;
        if (amount == 0) return;

        rs.totalSettled = rs.totalClaimed;

        IERC20(token).safeTransfer(receiver, amount);

        emit Settled(receiver, token, msg.sender, amount);
    }

    // =========================================================================
    // Withdrawal Flow
    // =========================================================================

    /// @notice Start the withdrawal countdown. Only the payer can call.
    function initiateWithdraw(
        ChannelConfig calldata config,
        uint128 amount
    ) external {
        if (msg.sender != config.payer) revert InvalidChannel();
        if (amount == 0) revert NothingToWithdraw();

        bytes32 channelId = getChannelId(config);

        WithdrawalState storage ws = pendingWithdrawals[channelId];
        if (ws.initiatedAt != 0) revert WithdrawalAlreadyPending();

        ws.amount = amount;
        ws.initiatedAt = uint40(block.timestamp);

        uint40 finalizeAfter = uint40(block.timestamp) + config.withdrawDelay;
        emit WithdrawInitiated(channelId, amount, finalizeAfter);
    }

    /// @notice Finalize withdrawal after delay has elapsed.
    ///         Anyone can submit.
    function finalizeWithdraw(
        ChannelConfig calldata config
    ) external nonReentrant {
        bytes32 channelId = getChannelId(config);
        WithdrawalState storage ws = pendingWithdrawals[channelId];

        if (ws.initiatedAt == 0) revert WithdrawalNotPending();
        if (
            block.timestamp <
            uint256(ws.initiatedAt) + uint256(config.withdrawDelay)
        ) {
            revert WithdrawDelayNotElapsed();
        }

        ChannelState storage ch = channels[channelId];
        uint128 available = ch.balance - ch.totalClaimed;
        uint128 withdrawAmount = ws.amount > available ? available : ws.amount;

        ws.amount = 0;
        ws.initiatedAt = 0;
        ch.balance -= withdrawAmount;

        emit WithdrawFinalized(channelId, withdrawAmount, msg.sender);

        if (withdrawAmount > 0) {
            IERC20(config.token).safeTransfer(config.payer, withdrawAmount);
        }
    }

    /// @notice Instant refund called by the receiverAuthorizer.
    function refund(ChannelConfig calldata config) external nonReentrant {
        if (msg.sender != config.receiverAuthorizer) {
            revert NotReceiverAuthorizer();
        }
        _executeRefund(config);
    }

    /// @notice Instant refund. Anyone can submit with a signature authorized by the receiverAuthorizer.
    function refundWithSignature(
        ChannelConfig calldata config,
        bytes calldata receiverAuthorizerSignature
    ) external nonReentrant {
        bytes32 channelId = getChannelId(config);
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(REFUND_TYPEHASH, channelId))
        );
        if (
            !SignatureChecker.isValidSignatureNow(
                config.receiverAuthorizer,
                digest,
                receiverAuthorizerSignature
            )
        ) {
            revert InvalidSignature();
        }
        _executeRefund(config);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    function getChannelId(
        ChannelConfig calldata config
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(config));
    }

    function getVoucherDigest(
        bytes32 channelId,
        uint128 maxClaimableAmount
    ) external view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(VOUCHER_TYPEHASH, channelId, maxClaimableAmount)
                )
            );
    }

    function getRefundDigest(
        bytes32 channelId
    ) external view returns (bytes32) {
        return
            _hashTypedDataV4(keccak256(abi.encode(REFUND_TYPEHASH, channelId)));
    }

    function getClaimBatchDigest(
        VoucherClaim[] calldata voucherClaims
    ) external view returns (bytes32) {
        bytes32 claimsHash = _computeClaimsHash(voucherClaims);
        return
            _hashTypedDataV4(
                keccak256(abi.encode(CLAIM_BATCH_TYPEHASH, claimsHash))
            );
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    function _validateConfig(ChannelConfig calldata config) internal pure {
        if (config.payer == address(0)) revert InvalidChannel();
        if (config.receiver == address(0)) revert InvalidChannel();
        if (config.receiverAuthorizer == address(0)) revert InvalidChannel();
        if (config.token == address(0)) revert InvalidChannel();
        if (
            config.withdrawDelay < MIN_WITHDRAW_DELAY ||
            config.withdrawDelay > MAX_WITHDRAW_DELAY
        ) {
            revert WithdrawDelayOutOfRange();
        }
    }

    function _processVoucherClaim(VoucherClaim calldata vc) internal {
        bytes32 channelId = getChannelId(vc.voucher.channel);
        ChannelState storage ch = channels[channelId];

        if (vc.totalClaimed <= ch.totalClaimed) return;
        if (vc.totalClaimed > vc.voucher.maxClaimableAmount)
            revert ClaimExceedsCeiling();
        if (vc.totalClaimed > ch.balance) revert ClaimExceedsBalance();

        bytes32 structHash = keccak256(
            abi.encode(
                VOUCHER_TYPEHASH,
                channelId,
                vc.voucher.maxClaimableAmount
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address payerAuth = vc.voucher.channel.payerAuthorizer;
        if (payerAuth != address(0)) {
            address recovered = ECDSA.recoverCalldata(digest, vc.signature);
            if (recovered != payerAuth) revert InvalidSignature();
        } else {
            if (
                !SignatureChecker.isValidSignatureNow(
                    vc.voucher.channel.payer,
                    digest,
                    vc.signature
                )
            ) {
                revert InvalidSignature();
            }
        }

        uint128 claimDelta = vc.totalClaimed - ch.totalClaimed;
        ch.totalClaimed = vc.totalClaimed;
        receivers[vc.voucher.channel.receiver][vc.voucher.channel.token]
            .totalClaimed += claimDelta;

        emit Claimed(channelId, msg.sender, claimDelta, vc.totalClaimed);
    }

    function _computeClaimsHash(
        VoucherClaim[] calldata voucherClaims
    ) internal pure returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](voucherClaims.length);
        for (uint256 i = 0; i < voucherClaims.length; ++i) {
            hashes[i] = keccak256(
                abi.encode(
                    getChannelId(voucherClaims[i].voucher.channel),
                    voucherClaims[i].voucher.maxClaimableAmount,
                    voucherClaims[i].totalClaimed
                )
            );
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function _executeRefund(ChannelConfig calldata config) internal {
        bytes32 channelId = getChannelId(config);
        ChannelState storage ch = channels[channelId];
        uint128 refundAmount = ch.balance - ch.totalClaimed;
        ch.balance = ch.totalClaimed;

        _clearPendingWithdrawal(channelId);
        emit Refunded(channelId, msg.sender, refundAmount);

        if (refundAmount > 0) {
            IERC20(config.token).safeTransfer(config.payer, refundAmount);
        }
    }

    function _clearPendingWithdrawal(bytes32 channelId) internal {
        WithdrawalState storage ws = pendingWithdrawals[channelId];
        if (ws.initiatedAt != 0) {
            ws.amount = 0;
            ws.initiatedAt = 0;
        }
    }
}
