// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IDepositCollector} from "./interfaces/IDepositCollector.sol";

/// @title x402BatchSettlement
/// @notice Stateless unidirectional payment channel contract for the x402 `batch-settlement` scheme on EVM.
/// @dev Channel identity is derived from an immutable ChannelConfig struct:
///      `channelId = keccak256(abi.encode(channelConfig))`.
///      Deployed at the same address across all supported EVM chains using CREATE2.
///      Uses {ReentrancyGuardTransient} (EIP-1153); deploy only on chains with transient storage support.
///      Fee-On-Transfer and rebasing tokens are not recommended for this protocol and are not guaranteed
///      to work as other tokens.
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

    bytes32 public constant VOUCHER_TYPEHASH = keccak256("Voucher(bytes32 channelId,uint128 maxClaimableAmount)");

    bytes32 public constant REFUND_TYPEHASH = keccak256("Refund(bytes32 channelId,uint256 nonce,uint128 amount)");

    /// @dev EIP-712 entry for one row in a signed claim batch (mirrors on-chain `VoucherClaim` fields used for authorization).
    bytes32 public constant CLAIM_ENTRY_TYPEHASH =
        keccak256("ClaimEntry(bytes32 channelId,uint128 maxClaimableAmount,uint128 totalClaimed)");

    /// @dev Full nested EIP-712 type so wallets can render `ClaimEntry[]` for user review.
    bytes32 public constant CLAIM_BATCH_TYPEHASH = keccak256(
        "ClaimBatch(ClaimEntry[] claims)ClaimEntry(bytes32 channelId,uint128 maxClaimableAmount,uint128 totalClaimed)"
    );

    // =========================================================================
    // Storage
    // =========================================================================

    mapping(bytes32 channelId => ChannelState) public channels;
    mapping(bytes32 channelId => uint256) public refundNonce;
    mapping(bytes32 channelId => WithdrawalState) public pendingWithdrawals;
    mapping(address receiver => mapping(address token => ReceiverState)) public receivers;

    // =========================================================================
    // Events
    // =========================================================================

    event ChannelCreated(bytes32 indexed channelId, ChannelConfig config);
    event Deposited(bytes32 indexed channelId, address indexed sender, uint128 amount, uint128 newBalance);
    event Claimed(bytes32 indexed channelId, address indexed sender, uint128 claimAmount, uint128 newTotalClaimed);
    event Settled(address indexed receiver, address indexed token, address indexed sender, uint128 amount);
    event Refunded(bytes32 indexed channelId, address indexed sender, uint128 amount);
    event WithdrawInitiated(bytes32 indexed channelId, uint128 amount, uint40 finalizeAfter);
    event WithdrawFinalized(bytes32 indexed channelId, uint128 amount, address sender);

    // =========================================================================
    // Errors
    // =========================================================================

    error InvalidChannel();
    error ZeroDeposit();
    error DepositOverflow();
    error InvalidSignature();
    error NotReceiverAuthorizer();
    error NotAuthorizedToClaim();
    error NotAuthorizedToRefund();
    error ClaimExceedsCeiling();
    error ClaimExceedsBalance();
    error WithdrawalAlreadyPending();
    error WithdrawalNotPending();
    error NotAuthorizedToFinalizeWithdraw();
    error WithdrawDelayNotElapsed();
    error NothingToWithdraw();
    error WithdrawDelayOutOfRange();
    error EmptyBatch();
    error DepositCollectionFailed();
    error InvalidCollector();
    error InvalidRefundNonce();
    error ZeroRefund();

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
        IDepositCollector(collector).collect(config.payer, config.token, amount, channelId, msg.sender, collectorData);
        uint256 balAfter = IERC20(config.token).balanceOf(address(this));
        if (balAfter != balBefore + amount) revert DepositCollectionFailed();
    }

    // =========================================================================
    // Claim & Settle
    // =========================================================================

    /// @notice Batch-validate voucher claims and update channel accounting.
    ///         For each row, caller must be `receiverAuthorizer` or `receiver` on that row's channel.
    function claim(
        VoucherClaim[] calldata voucherClaims
    ) external nonReentrant {
        if (voucherClaims.length == 0) revert EmptyBatch();

        for (uint256 i = 0; i < voucherClaims.length; ++i) {
            ChannelConfig calldata c = voucherClaims[i].voucher.channel;
            if (!_isReceiverSide(msg.sender, c)) {
                revert NotAuthorizedToClaim();
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

        address authorizer = voucherClaims[0].voucher.channel.receiverAuthorizer;

        bytes32 digest = _hashTypedDataV4(_claimBatchStructHash(voucherClaims));
        if (!SignatureChecker.isValidSignatureNow(authorizer, digest, authorizerSignature)) {
            revert InvalidSignature();
        }

        for (uint256 i = 0; i < voucherClaims.length; ++i) {
            if (voucherClaims[i].voucher.channel.receiverAuthorizer != authorizer) {
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

    /// @notice Start the withdrawal countdown. Only `config.payer` or `config.payerAuthorizer` may call.
    function initiateWithdraw(ChannelConfig calldata config, uint128 amount) external {
        if (msg.sender != config.payer && msg.sender != config.payerAuthorizer) {
            revert InvalidChannel();
        }
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
    ///         Caller must be `config.payer` or `config.payerAuthorizer`.
    function finalizeWithdraw(
        ChannelConfig calldata config
    ) external nonReentrant {
        if (msg.sender != config.payer && msg.sender != config.payerAuthorizer) {
            revert NotAuthorizedToFinalizeWithdraw();
        }

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

        emit WithdrawFinalized(channelId, withdrawAmount, msg.sender);

        if (withdrawAmount > 0) {
            IERC20(config.token).safeTransfer(config.payer, withdrawAmount);
        }
    }

    /// @notice Cooperative refund to the payer. `receiverAuthorizer` or `receiver` may call.
    /// @param amount Requested refund; capped to unclaimed escrow `balance - totalClaimed`. No-ops if capped amount is zero.
    function refund(ChannelConfig calldata config, uint128 amount) external nonReentrant {
        if (!_isReceiverSide(msg.sender, config)) {
            revert NotAuthorizedToRefund();
        }
        _executeRefund(config, amount);
    }

    /// @notice Same as `refund`, but anyone may submit a signature from `receiverAuthorizer` authorizing `amount` for `nonce`.
    /// @param amount Requested refund in the signature; capped to unclaimed escrow like `refund`. No-ops if capped amount is zero (nonce not consumed).
    /// @param nonce Must equal `refundNonce(channelId)`; incremented after each successful refund.
    function refundWithSignature(
        ChannelConfig calldata config,
        uint128 amount,
        uint256 nonce,
        bytes calldata receiverAuthorizerSignature
    ) external nonReentrant {
        bytes32 channelId = getChannelId(config);
        if (nonce != refundNonce[channelId]) revert InvalidRefundNonce();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(REFUND_TYPEHASH, channelId, nonce, amount)));
        if (!SignatureChecker.isValidSignatureNow(config.receiverAuthorizer, digest, receiverAuthorizerSignature)) {
            revert InvalidSignature();
        }
        _executeRefund(config, amount);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    function getChannelId(
        ChannelConfig calldata config
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(config));
    }

    function getVoucherDigest(bytes32 channelId, uint128 maxClaimableAmount) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, channelId, maxClaimableAmount)));
    }

    function getRefundDigest(bytes32 channelId, uint256 nonce, uint128 amount) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(REFUND_TYPEHASH, channelId, nonce, amount)));
    }

    function getClaimBatchDigest(
        VoucherClaim[] calldata voucherClaims
    ) external view returns (bytes32) {
        return _hashTypedDataV4(_claimBatchStructHash(voucherClaims));
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    function _isReceiverSide(address sender, ChannelConfig calldata config) internal pure returns (bool) {
        return sender == config.receiverAuthorizer || sender == config.receiver;
    }

    function _validateConfig(
        ChannelConfig calldata config
    ) internal pure {
        if (config.payer == address(0)) revert InvalidChannel();
        if (config.receiver == address(0)) revert InvalidChannel();
        if (config.receiverAuthorizer == address(0)) revert InvalidChannel();
        if (config.token == address(0)) revert InvalidChannel();
        if (config.withdrawDelay < MIN_WITHDRAW_DELAY || config.withdrawDelay > MAX_WITHDRAW_DELAY) {
            revert WithdrawDelayOutOfRange();
        }
    }

    function _processVoucherClaim(
        VoucherClaim calldata vc
    ) internal {
        bytes32 channelId = getChannelId(vc.voucher.channel);
        ChannelState storage ch = channels[channelId];

        if (vc.totalClaimed <= ch.totalClaimed) return;
        if (vc.totalClaimed > vc.voucher.maxClaimableAmount) {
            revert ClaimExceedsCeiling();
        }
        if (vc.totalClaimed > ch.balance) revert ClaimExceedsBalance();

        bytes32 structHash = keccak256(abi.encode(VOUCHER_TYPEHASH, channelId, vc.voucher.maxClaimableAmount));
        bytes32 digest = _hashTypedDataV4(structHash);

        address payerAuth = vc.voucher.channel.payerAuthorizer;
        if (payerAuth != address(0)) {
            address recovered = ECDSA.recoverCalldata(digest, vc.signature);
            if (recovered != payerAuth) revert InvalidSignature();
        } else {
            if (!SignatureChecker.isValidSignatureNow(vc.voucher.channel.payer, digest, vc.signature)) {
                revert InvalidSignature();
            }
        }

        uint128 claimDelta = vc.totalClaimed - ch.totalClaimed;
        ch.totalClaimed = vc.totalClaimed;
        receivers[vc.voucher.channel.receiver][vc.voucher.channel.token].totalClaimed += claimDelta;

        emit Claimed(channelId, msg.sender, claimDelta, vc.totalClaimed);
    }

    /// @dev EIP-712 `hashStruct(ClaimBatch)` for the given claims (see `CLAIM_BATCH_TYPEHASH` / `CLAIM_ENTRY_TYPEHASH`).
    function _claimBatchStructHash(
        VoucherClaim[] calldata voucherClaims
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(CLAIM_BATCH_TYPEHASH, _claimEntriesRootHash(voucherClaims)));
    }

    /// @dev EIP-712 encoding for `ClaimEntry[]`: `keccak256(abi.encodePacked(hashStruct(entry), ...))`.
    function _claimEntriesRootHash(
        VoucherClaim[] calldata voucherClaims
    ) internal pure returns (bytes32) {
        uint256 n = voucherClaims.length;
        if (n == 0) {
            return keccak256("");
        }
        bytes32[] memory entryHashes = new bytes32[](n);
        for (uint256 i = 0; i < n; ++i) {
            bytes32 channelId = getChannelId(voucherClaims[i].voucher.channel);
            entryHashes[i] = keccak256(
                abi.encode(
                    CLAIM_ENTRY_TYPEHASH,
                    channelId,
                    voucherClaims[i].voucher.maxClaimableAmount,
                    voucherClaims[i].totalClaimed
                )
            );
        }
        return keccak256(abi.encodePacked(entryHashes));
    }

    function _executeRefund(ChannelConfig calldata config, uint128 amount) internal {
        if (amount == 0) revert ZeroRefund();

        bytes32 channelId = getChannelId(config);
        ChannelState storage ch = channels[channelId];
        uint128 available = ch.balance - ch.totalClaimed;
        uint128 refundAmount = amount > available ? available : amount;
        if (refundAmount == 0) return;

        ch.balance -= refundAmount;

        _clearPendingWithdrawal(channelId);
        emit Refunded(channelId, msg.sender, refundAmount);

        IERC20(config.token).safeTransfer(config.payer, refundAmount);

        unchecked {
            refundNonce[channelId]++;
        }
    }

    function _clearPendingWithdrawal(
        bytes32 channelId
    ) internal {
        WithdrawalState storage ws = pendingWithdrawals[channelId];
        if (ws.initiatedAt != 0) {
            ws.amount = 0;
            ws.initiatedAt = 0;
        }
    }
}
