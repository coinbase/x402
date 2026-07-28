// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {x402BatchSettlement} from "./x402BatchSettlement.sol";

/// @title x402BatchSettlementHybridGateway
/// @notice Shared receiver for {x402BatchSettlement} channels, operated by a single operator.
///         Payers escrow into channels whose `receiver` and `receiverAuthorizer` are this gateway.
///         The operator redeems payer-signed channel vouchers and must, in the same transaction,
///         attribute every claimed token unit to receiver balances. Attribution is at the
///         operator's discretion, but committed balances are irreversible: they can only grow,
///         and the only decrement path is a withdrawal that pays the receiver itself.
contract x402BatchSettlementHybridGateway is
    Multicall,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;

    // =========================================================================
    // Structs
    // =========================================================================

    /// @notice One channel redemption: the payer-signed voucher plus the new cumulative claim.
    struct ChannelClaim {
        x402BatchSettlement.ChannelConfig config; // receiver and receiverAuthorizer must be this gateway
        uint128 maxClaimableAmount; // payer-signed cumulative ceiling
        bytes signature; // payer voucher signature
        uint128 totalClaimed; // new cumulative claim, must exceed the onchain total and respect the ceiling
    }

    /// @notice One receiver credit.
    struct Credit {
        address receiver;
        address token;
        uint128 amount;
    }

    // =========================================================================
    // Storage
    // =========================================================================

    /// @notice The {x402BatchSettlement} deployment this gateway claims and settles against.
    x402BatchSettlement public immutable X402_BATCH_SETTLEMENT;

    /// @notice The only address allowed to redeem channels and refund payers.
    address public immutable OPERATOR;

    /// @notice A receiver's accrued, not-yet-withdrawn balance per token.
    mapping(address receiver => mapping(address token => uint128))
        public withdrawable;

    /// @notice Aggregate accrued, not-yet-withdrawn receiver liabilities per token.
    mapping(address token => uint128) public totalOutstanding;

    // =========================================================================
    // Events
    // =========================================================================

    /// @notice Emitted when a receiver is credited.
    event Credited(
        address indexed receiver,
        address indexed token,
        uint128 amount
    );

    /// @notice Emitted when a receiver's accrued balance is transferred out.
    event Withdrawn(
        address indexed receiver,
        address indexed token,
        address indexed sender,
        uint128 amount
    );

    // =========================================================================
    // Errors
    // =========================================================================

    error InvalidConstruction();
    error NotOperator();
    error EmptyBatch();
    error NotGatewayChannel();
    error UnsortedOrDuplicateChannel();
    error NoClaimDelta();
    error ZeroCredit();
    error InvalidCreditReceiver();
    error ConservationMismatch();
    error GatewayInsolvent();
    error NothingToWithdraw();

    // =========================================================================
    // Constructor
    // =========================================================================

    /// @notice Pins the settlement and operator addresses.
    /// @param settlement The {x402BatchSettlement} deployment for this chain.
    /// @param operator The address allowed to call {settleBatch} and {refundChannel}.
    constructor(address settlement, address operator) {
        if (settlement == address(0) || operator == address(0))
            revert InvalidConstruction();
        X402_BATCH_SETTLEMENT = x402BatchSettlement(settlement);
        OPERATOR = operator;
    }

    // =========================================================================
    // Redemption
    // =========================================================================

    /// @notice Atomically claims channel vouchers, settles the funds into this gateway, and
    ///         credits receiver balances.
    ///
    /// @param claims Channel redemptions, strictly ordered by channel id.
    /// @param credits Receiver credits; unordered, duplicates allowed and summed.
    ///
    /// @dev Only the operator may call. Enforced invariants:
    ///        1. Every claimed channel has this gateway as `receiver` and `receiverAuthorizer`.
    ///        2. Every claim advances its channel's cumulative total; every credit is nonzero.
    ///        3. Conservation per token: the sum of channel claim deltas equals the sum of
    ///           credits. Claimed funds cannot be left unattributed, and credits cannot exceed
    ///           what was claimed.
    ///        4. Solvency per token: the gateway balance covers `totalOutstanding` after crediting.
    ///      Payer voucher signatures and claim ceilings are verified by the settlement contract.
    function settleBatch(
        ChannelClaim[] calldata claims,
        Credit[] calldata credits
    ) external nonReentrant {
        if (msg.sender != OPERATOR) revert NotOperator();
        uint256 n = claims.length;
        uint256 m = credits.length;
        if (n == 0 || m == 0) revert EmptyBatch();

        address[] memory tokens = new address[](n + m);
        uint128[] memory claimedDelta = new uint128[](n + m);
        uint128[] memory creditedDelta = new uint128[](n + m);
        uint256 tokenCount;

        // Build the base voucher claims and accumulate per-token claim deltas.
        x402BatchSettlement.VoucherClaim[]
            memory voucherClaims = new x402BatchSettlement.VoucherClaim[](n);
        bytes32 previousChannelId;
        for (uint256 i = 0; i < n; ++i) {
            ChannelClaim calldata cc = claims[i];
            if (
                cc.config.receiver != address(this) ||
                cc.config.receiverAuthorizer != address(this)
            ) {
                revert NotGatewayChannel();
            }

            bytes32 channelId = X402_BATCH_SETTLEMENT.getChannelId(cc.config);
            if (i != 0 && channelId <= previousChannelId)
                revert UnsortedOrDuplicateChannel();
            previousChannelId = channelId;

            (, uint128 priorClaimed) = X402_BATCH_SETTLEMENT.channels(
                channelId
            );
            if (cc.totalClaimed <= priorClaimed) revert NoClaimDelta();

            uint256 t = _findOrAddToken(tokens, tokenCount, cc.config.token);
            if (t == tokenCount) ++tokenCount;
            claimedDelta[t] += cc.totalClaimed - priorClaimed;

            voucherClaims[i] = x402BatchSettlement.VoucherClaim({
                voucher: x402BatchSettlement.Voucher({
                    channel: cc.config,
                    maxClaimableAmount: cc.maxClaimableAmount
                }),
                signature: cc.signature,
                totalClaimed: cc.totalClaimed
            });
        }

        // Claim (gateway is the channel receiver) and sweep the claimed funds into this contract.
        X402_BATCH_SETTLEMENT.claim(voucherClaims);
        for (uint256 t = 0; t < tokenCount; ++t) {
            X402_BATCH_SETTLEMENT.settle(address(this), tokens[t]);
        }

        // Apply receiver credits and accumulate per-token credit deltas.
        for (uint256 j = 0; j < m; ++j) {
            Credit calldata c = credits[j];
            if (c.receiver == address(0)) revert InvalidCreditReceiver();
            if (c.amount == 0) revert ZeroCredit();

            withdrawable[c.receiver][c.token] += c.amount;
            totalOutstanding[c.token] += c.amount;

            uint256 t = _findOrAddToken(tokens, tokenCount, c.token);
            if (t == tokenCount) ++tokenCount;
            creditedDelta[t] += c.amount;

            emit Credited(c.receiver, c.token, c.amount);
        }

        // Conservation and solvency.
        for (uint256 t = 0; t < tokenCount; ++t) {
            if (claimedDelta[t] != creditedDelta[t])
                revert ConservationMismatch();
            if (
                IERC20(tokens[t]).balanceOf(address(this)) <
                totalOutstanding[tokens[t]]
            ) {
                revert GatewayInsolvent();
            }
        }
    }

    /// @notice Cooperative refund of unclaimed channel escrow to the channel payer.
    ///
    /// @param config The channel configuration; must have this gateway as receiver.
    /// @param amount Requested refund; capped by the settlement contract to unclaimed escrow.
    ///
    /// @dev Only the operator may call: refunding early forfeits amounts that are earned but not
    ///      yet claimed. Funds always return to `config.payer`; the payer's unilateral escape
    ///      hatch is the settlement contract's timed withdrawal, which needs no gateway involvement.
    function refundChannel(
        x402BatchSettlement.ChannelConfig calldata config,
        uint128 amount
    ) external nonReentrant {
        if (msg.sender != OPERATOR) revert NotOperator();
        X402_BATCH_SETTLEMENT.refund(config, amount);
    }

    // =========================================================================
    // Withdraw
    // =========================================================================

    /// @notice Transfers a receiver's accrued balance for a token to the receiver.
    ///
    /// @param receiver The credited receiver.
    /// @param token The ERC-20 token to withdraw.
    ///
    /// @dev Permissionless (relay-friendly). Funds always go to `receiver`; the caller cannot
    ///      redirect them.
    function withdraw(address receiver, address token) external nonReentrant {
        uint128 amount = withdrawable[receiver][token];
        if (amount == 0) revert NothingToWithdraw();

        withdrawable[receiver][token] = 0;
        totalOutstanding[token] -= amount;

        emit Withdrawn(receiver, token, msg.sender, amount);

        IERC20(token).safeTransfer(receiver, amount);
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    /// @dev Returns the index of `token` in `tokens`, appending it if absent. The caller
    ///      increments its count when the returned index equals the current count.
    function _findOrAddToken(
        address[] memory tokens,
        uint256 count,
        address token
    ) private pure returns (uint256) {
        for (uint256 t = 0; t < count; ++t) {
            if (tokens[t] == token) return t;
        }
        tokens[count] = token;
        return count;
    }
}
