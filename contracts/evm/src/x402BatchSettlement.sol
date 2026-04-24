// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {IDepositCollector} from "./interfaces/IDepositCollector.sol";

/// @title x402BatchSettlement
/// @notice Stateless unidirectional payment channel contract for the x402 `batch-settlement` scheme on EVM.
///
/// @dev Channel identity is derived from an immutable `ChannelConfig`:
///      `channelId = keccak256(abi.encode(channelConfig))`.
///      Deploy at the same address on every chain via CREATE2.
///      Uses `ReentrancyGuardTransient` (EIP-1153); deploy only where transient storage is supported.
///      Fee-on-transfer and rebasing tokens are not recommended and are not guaranteed to behave like standard ERC-20s.
///
/// @author Coinbase
contract x402BatchSettlement is EIP712, Multicall, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Structs
    // =========================================================================

    /// @notice Immutable channel parameters; hashed to form `channelId`.
    struct ChannelConfig {
        address payer;
        address payerAuthorizer;
        address receiver;
        address receiverAuthorizer;
        address token;
        uint40 withdrawDelay;
        bytes32 salt;
    }

    /// @notice Per-channel escrow and claim totals.
    struct ChannelState {
        uint128 balance;
        uint128 totalClaimed;
    }

    /// @notice In-flight timed withdrawal for a channel.
    struct WithdrawalState {
        uint128 amount;
        /// @dev Timestamp (seconds) when the withdrawal was started; zero if none pending.
        uint40 initiatedAt;
    }

    /// @notice Per-receiver, per-token aggregates for settlement sweeps.
    struct ReceiverState {
        uint128 totalClaimed;
        uint128 totalSettled;
    }

    /// @notice Payer-signed authorization data (no signature field here; that lives on `VoucherClaim`).
    struct Voucher {
        ChannelConfig channel;
        uint128 maxClaimableAmount;
    }

    /// @notice One signed voucher row plus the cumulative amount the receiver side is claiming.
    ///
    /// @dev Cumulative `totalClaimed` (not a delta) gives replay protection: replaying an old voucher after it
    ///      was applied is a no-op.
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

    /// @notice Emitted the first time a channel receives escrowed balance.
    event ChannelCreated(bytes32 indexed channelId, ChannelConfig config);

    /// @notice Emitted after a successful deposit into a channel.
    event Deposited(bytes32 indexed channelId, address indexed sender, uint128 amount, uint128 newBalance);

    /// @notice Emitted when the receiver side increases the cumulative claimed amount for a channel.
    event Claimed(bytes32 indexed channelId, address indexed sender, uint128 claimAmount, uint128 newTotalClaimed);

    /// @notice Emitted when claimed funds are transferred to the receiver during settlement.
    event Settled(address indexed receiver, address indexed token, address indexed sender, uint128 amount);

    /// @notice Emitted when escrowed funds are refunded to the payer.
    event Refunded(bytes32 indexed channelId, address indexed sender, uint128 amount);

    /// @notice Emitted when a timed withdrawal is started.
    event WithdrawInitiated(bytes32 indexed channelId, uint128 amount, uint40 finalizeAfter);

    /// @notice Emitted when a timed withdrawal completes and funds move to the payer.
    event WithdrawFinalized(bytes32 indexed channelId, address indexed sender, uint128 amount);

    // =========================================================================
    // Errors
    // =========================================================================

    /// @dev Errors use CapWords naming.

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
    error WithdrawAmountExceedsAvailable();
    error WithdrawDelayOutOfRange();
    error EmptyBatch();
    error DepositCollectionFailed();
    error InvalidCollector();
    error InvalidRefundNonce();
    error ZeroRefund();

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @notice Sets the EIP-712 domain for vouchers, refunds, and claim batches.
    constructor() EIP712("x402 Batch Settlement", "1") {}

    // =========================================================================
    // Deposits
    // =========================================================================

    /// @notice Deposits tokens into a channel using a pluggable collector.
    ///
    /// @dev The collector executes the pull; this function checks the contract's token balance increased
    ///      by `amount` after the call (post-condition) to detect fee-on-transfer or failed pulls.
    ///
    /// @param config The immutable channel configuration.
    /// @param amount The exact amount of tokens to deposit.
    /// @param collector The deposit collector contract address.
    /// @param collectorData Opaque bytes forwarded to the collector (signatures, nonces, etc.).
    function deposit(
        ChannelConfig calldata config,
        uint128 amount,
        address collector,
        bytes calldata collectorData
    ) external nonReentrant {
        if (config.payer == address(0)) revert InvalidChannel();
        if (config.receiver == address(0)) revert InvalidChannel();
        if (config.receiverAuthorizer == address(0)) revert InvalidChannel();
        if (config.token == address(0)) revert InvalidChannel();
        if (config.withdrawDelay < MIN_WITHDRAW_DELAY || config.withdrawDelay > MAX_WITHDRAW_DELAY) {
            revert WithdrawDelayOutOfRange();
        }
        if (amount == 0) revert ZeroDeposit();
        if (collector == address(0)) revert InvalidCollector();

        bytes32 channelId = getChannelId(config);
        ChannelState storage ch = channels[channelId];

        if (amount > type(uint128).max - ch.balance) revert DepositOverflow();
        ch.balance += amount;

        // First deposit on this channel (escrow was empty before this deposit)
        if (ch.balance == amount && ch.totalClaimed == 0) {
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

    /// @notice Applies a batch of voucher claims and updates channel accounting.
    ///
    /// @param voucherClaims Signed voucher rows with cumulative claim totals.
    ///
    /// @dev For each row, `msg.sender` must be `receiverAuthorizer` or `receiver` for that row's channel.
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

    /// @notice Applies voucher claims authorized by a `receiverAuthorizer` EIP-712 signature over the batch.
    ///
    /// @param voucherClaims Claim rows for channels sharing the same `receiverAuthorizer`.
    /// @param authorizerSignature Signature from `receiverAuthorizer` over `getClaimBatchDigest(voucherClaims)`.
    ///
    /// @dev Callable by anyone (relay-friendly). All rows must match the same `receiverAuthorizer`.
    function claimWithSignature(
        VoucherClaim[] calldata voucherClaims,
        bytes calldata authorizerSignature
    ) external nonReentrant {
        if (voucherClaims.length == 0) revert EmptyBatch();

        address authorizer = voucherClaims[0].voucher.channel.receiverAuthorizer;

        bytes32 digest = getClaimBatchDigest(voucherClaims);
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

    /// @notice Transfers claimed-but-not-yet-settled tokens to the receiver for a `(receiver, token)` pair.
    ///
    /// @param receiver The receiver address whose pending settlement is swept.
    /// @param token The ERC-20 token to transfer.
    ///
    /// @dev Permissionless: typically called by the receiver or a facilitator.
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

    /// @notice Starts the payer-side timed withdrawal window for unclaimed escrow.
    ///
    /// @param config The channel configuration.
    /// @param amount The gross amount requested; may be capped on finalization.
    ///
    /// @dev Only `config.payer` or `config.payerAuthorizer` may call. Reverts if a withdrawal is already pending.
    function initiateWithdraw(ChannelConfig calldata config, uint128 amount) external {
        if (msg.sender != config.payer && msg.sender != config.payerAuthorizer) {
            revert InvalidChannel();
        }
        if (amount == 0) revert NothingToWithdraw();

        bytes32 channelId = getChannelId(config);

        WithdrawalState storage ws = pendingWithdrawals[channelId];
        if (ws.initiatedAt != 0) revert WithdrawalAlreadyPending();

        ChannelState storage ch = channels[channelId];
        uint128 available = ch.balance - ch.totalClaimed;
        if (amount > available) revert WithdrawAmountExceedsAvailable();

        ws.amount = amount;
        ws.initiatedAt = uint40(block.timestamp);

        uint40 finalizeAfter = uint40(block.timestamp) + config.withdrawDelay;
        emit WithdrawInitiated(channelId, amount, finalizeAfter);
    }

    /// @notice Finalizes a pending withdrawal after `withdrawDelay` and sends tokens to the payer.
    ///
    /// @param config The channel configuration.
    ///
    /// @dev Only `config.payer` or `config.payerAuthorizer` may call. Amount may be capped by available escrow.
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

        emit WithdrawFinalized(channelId, msg.sender, withdrawAmount);

        if (withdrawAmount > 0) {
            IERC20(config.token).safeTransfer(config.payer, withdrawAmount);
        }
    }

    /// @notice Cooperative refund of unclaimed escrow to the payer.
    ///
    /// @param config The channel configuration.
    /// @param amount Requested refund; capped to `balance - totalClaimed`. No-ops if the capped amount is zero.
    ///
    /// @dev Only `receiverAuthorizer` or `receiver` may call.
    function refund(ChannelConfig calldata config, uint128 amount) external nonReentrant {
        if (!_isReceiverSide(msg.sender, config)) {
            revert NotAuthorizedToRefund();
        }
        _executeRefund(config, amount);
    }

    /// @notice Refunds unclaimed escrow to the payer using an EIP-712 `Refund` signature from `receiverAuthorizer`.
    ///
    /// @param config The channel configuration.
    /// @param amount The amount in the signature; capped like `refund`. No-op if capped amount is zero (nonce unchanged).
    /// @param nonce Must equal `refundNonce(channelId)` for the channel; incremented after each successful refund.
    /// @param receiverAuthorizerSignature EIP-712 signature from `receiverAuthorizer` over the refund digest.
    ///
    /// @dev Callable by anyone (relay-friendly).
    function refundWithSignature(
        ChannelConfig calldata config,
        uint128 amount,
        uint256 nonce,
        bytes calldata receiverAuthorizerSignature
    ) external nonReentrant {
        bytes32 channelId = getChannelId(config);
        if (nonce != refundNonce[channelId]) revert InvalidRefundNonce();
        bytes32 digest = getRefundDigest(channelId, nonce, amount);
        if (!SignatureChecker.isValidSignatureNow(config.receiverAuthorizer, digest, receiverAuthorizerSignature)) {
            revert InvalidSignature();
        }
        _executeRefund(config, amount);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    /// @notice Returns the canonical `channelId` for a channel configuration.
    ///
    /// @param config The channel configuration to hash.
    ///
    /// @return The `keccak256(abi.encode(config))` channel id.
    function getChannelId(
        ChannelConfig calldata config
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(config));
    }

    /// @notice EIP-712 digest for a `Voucher` with the given `channelId` and `maxClaimableAmount`.
    ///
    /// @param channelId The channel identifier.
    /// @param maxClaimableAmount The ceiling encoded in the voucher.
    ///
    /// @return The typed data hash signers use for payer authorization.
    function getVoucherDigest(bytes32 channelId, uint128 maxClaimableAmount) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, channelId, maxClaimableAmount)));
    }

    /// @notice EIP-712 digest for a cooperative `Refund` authorization.
    ///
    /// @param channelId The channel identifier.
    /// @param nonce The refund nonce (must match on-chain `refundNonce`).
    /// @param amount The signed refund amount.
    ///
    /// @return The typed data hash for `receiverAuthorizer` to sign.
    function getRefundDigest(bytes32 channelId, uint256 nonce, uint128 amount) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(REFUND_TYPEHASH, channelId, nonce, amount)));
    }

    /// @notice EIP-712 digest for the signed `ClaimBatch` (used by `claimWithSignature` and off-chain signing).
    ///
    /// @param voucherClaims The claim rows hashed into the batch.
    ///
    /// @return The typed data hash `receiverAuthorizer` signs for the batch.
    function getClaimBatchDigest(
        VoucherClaim[] calldata voucherClaims
    ) public view returns (bytes32) {
        uint256 n = voucherClaims.length;
        bytes32 entriesRoot;
        if (n == 0) {
            entriesRoot = keccak256("");
        } else {
            bytes32[] memory entryHashes = new bytes32[](n);
            for (uint256 i = 0; i < n; ++i) {
                bytes32 cid = getChannelId(voucherClaims[i].voucher.channel);
                entryHashes[i] = keccak256(
                    abi.encode(
                        CLAIM_ENTRY_TYPEHASH,
                        cid,
                        voucherClaims[i].voucher.maxClaimableAmount,
                        voucherClaims[i].totalClaimed
                    )
                );
            }
            entriesRoot = keccak256(abi.encodePacked(entryHashes));
        }
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_BATCH_TYPEHASH, entriesRoot)));
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    /// @dev True if `sender` may submit a claim for this channel (`receiver` or `receiverAuthorizer`).
    function _isReceiverSide(address sender, ChannelConfig calldata config) internal pure returns (bool) {
        return sender == config.receiverAuthorizer || sender == config.receiver;
    }

    /// @dev Validates the payer signature, updates `channels` and `receivers`, and emits `Claimed`.
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

        bytes32 digest = getVoucherDigest(channelId, vc.voucher.maxClaimableAmount);

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

    /// @dev Caps refund to available unclaimed escrow, reduces or clears any pending withdrawal, transfers to payer.
    /// @dev Always bumps `refundNonce` on any non-reverting entry, including the zero-available no-op, to prevent signature replay.
    function _executeRefund(ChannelConfig calldata config, uint128 amount) internal {
        if (amount == 0) revert ZeroRefund();

        bytes32 channelId = getChannelId(config);
        unchecked {
            refundNonce[channelId]++;
        }

        ChannelState storage ch = channels[channelId];
        uint128 available = ch.balance - ch.totalClaimed;
        uint128 refundAmount = amount > available ? available : amount;
        if (refundAmount == 0) return;

        ch.balance -= refundAmount;

        WithdrawalState storage pws = pendingWithdrawals[channelId];
        if (pws.initiatedAt != 0) {
            if (refundAmount >= pws.amount) {
                pws.amount = 0;
                pws.initiatedAt = 0;
            } else {
                pws.amount -= refundAmount;
            }
        }

        emit Refunded(channelId, msg.sender, refundAmount);

        IERC20(config.token).safeTransfer(config.payer, refundAmount);
    }
}
