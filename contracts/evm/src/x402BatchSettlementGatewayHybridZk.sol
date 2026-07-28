// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {x402BatchSettlement} from "./x402BatchSettlement.sol";

interface IAttributionVerifier {
    function verifyAttribution(
        bytes calldata proof,
        bytes32 batchCommitment
    ) external view returns (bool);
}

/// @title x402BatchSettlementZKHybridGateway
/// @notice Shared receiver for {x402BatchSettlement} channels. Anyone may redeem payer-signed
///         channel vouchers by supplying a zk proof that every claimed token unit is credited
///         to the receiver the payer designated. Credited balances only grow and can only be
///         withdrawn to the receiver itself.
///
/// @dev Each channel carries an attribution vector `V: payTo => cumulative amount attributed`,
///      committed onchain as {attributionRoot} (`bytes32(0)` is the empty vector; the
///      commitment scheme is fixed by the circuit). Per payment, the payer signs the EIP-712
///      message `Attribution(channelId, payTo, cumulativeAmount)` — the new value of
///      `V[payTo]` — so later messages for a pair supersede earlier ones and only the latest
///      per updated pair is needed to prove a batch.
///
///      A valid proof for `batchCommitment` attests, for every claim leaf
///      `(channelId, payer, token, priorClaimed, totalClaimed, oldRoot, newRoot)`:
///        - witnesses V_old, V_new with commitments oldRoot, newRoot;
///        - V_new >= V_old elementwise, and for every pair with V_new[payTo] > V_old[payTo],
///          a valid payer ECDSA signature over `Attribution(channelId, payTo, V_new[payTo])`
///          under {DOMAIN_SEPARATOR};
///        - sum(V_new) - sum(V_old) == totalClaimed - priorClaimed;
///      and, across the batch, the per-`(payTo, token)` sums of `V_new - V_old` equal the
///      credit leaves `(receiver, token, amount)` sorted strictly by `(receiver, token)`.
///
///      `priorClaimed` and `oldRoot` are read from onchain state and hashed into the
///      commitment, so a proof is bound to the exact pre-batch state and cannot be replayed.
contract x402BatchSettlementZKHybridGateway is
    Multicall,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;

    struct ChannelClaim {
        x402BatchSettlement.ChannelConfig config;
        uint128 maxClaimableAmount;
        bytes signature;
        uint128 totalClaimed;
        bytes32 newAttributionRoot;
    }

    struct Credit {
        address receiver;
        address token;
        uint128 amount;
    }

    bytes32 public constant ATTRIBUTION_TYPEHASH =
        keccak256(
            "Attribution(bytes32 channelId,address payTo,uint128 cumulativeAmount)"
        );

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    x402BatchSettlement public immutable X402_BATCH_SETTLEMENT;
    IAttributionVerifier public immutable VERIFIER;
    address public immutable OPERATOR;
    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(bytes32 channelId => bytes32) public attributionRoot;
    mapping(address receiver => mapping(address token => uint128))
        public withdrawable;
    mapping(address token => uint128) public totalOutstanding;

    event Credited(
        address indexed receiver,
        address indexed token,
        uint128 amount
    );
    event BatchProven(bytes32 indexed batchCommitment, address indexed prover);
    event AttributionRootUpdated(
        bytes32 indexed channelId,
        bytes32 oldRoot,
        bytes32 newRoot
    );
    event Withdrawn(
        address indexed receiver,
        address indexed token,
        address indexed sender,
        uint128 amount
    );

    error InvalidConstruction();
    error NotOperator();
    error EmptyBatch();
    error NotGatewayChannel();
    error UnsortedOrDuplicateChannel();
    error NoClaimDelta();
    error UnchangedAttributionRoot();
    error ZeroCredit();
    error InvalidCreditReceiver();
    error UnsortedOrDuplicateCredit();
    error InvalidAttributionProof();
    error ConservationMismatch();
    error GatewayInsolvent();
    error NothingToWithdraw();

    constructor(address settlement, address verifier, address operator) {
        if (
            settlement == address(0) ||
            verifier == address(0) ||
            operator == address(0)
        ) {
            revert InvalidConstruction();
        }
        X402_BATCH_SETTLEMENT = x402BatchSettlement(settlement);
        VERIFIER = IAttributionVerifier(verifier);
        OPERATOR = operator;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256("x402BatchSettlementZKHybridGateway"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Claims channel vouchers, settles the funds into this gateway, and credits
    ///         receiver balances under a verified attribution proof. Permissionless.
    /// @param claims Channel redemptions, strictly ordered by channel id.
    /// @param credits Receiver credits, strictly ordered by `(receiver, token)`.
    /// @param proof Attribution proof for this exact batch.
    function settleBatch(
        ChannelClaim[] calldata claims,
        Credit[] calldata credits,
        bytes calldata proof
    ) external nonReentrant {
        uint256 n = claims.length;
        uint256 m = credits.length;
        if (n == 0 || m == 0) revert EmptyBatch();

        address[] memory tokens = new address[](n + m);
        uint128[] memory claimedDelta = new uint128[](n + m);
        uint128[] memory creditedDelta = new uint128[](n + m);
        uint256 tokenCount;

        x402BatchSettlement.VoucherClaim[]
            memory voucherClaims = new x402BatchSettlement.VoucherClaim[](n);
        bytes32[] memory claimLeaves = new bytes32[](n);
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

            bytes32 oldRoot = attributionRoot[channelId];
            if (cc.newAttributionRoot == oldRoot)
                revert UnchangedAttributionRoot();
            attributionRoot[channelId] = cc.newAttributionRoot;
            emit AttributionRootUpdated(
                channelId,
                oldRoot,
                cc.newAttributionRoot
            );

            uint256 t = _findOrAddToken(tokens, tokenCount, cc.config.token);
            if (t == tokenCount) ++tokenCount;
            claimedDelta[t] += cc.totalClaimed - priorClaimed;

            claimLeaves[i] = keccak256(
                abi.encode(
                    channelId,
                    cc.config.payer,
                    cc.config.token,
                    priorClaimed,
                    cc.totalClaimed,
                    oldRoot,
                    cc.newAttributionRoot
                )
            );

            voucherClaims[i] = x402BatchSettlement.VoucherClaim({
                voucher: x402BatchSettlement.Voucher({
                    channel: cc.config,
                    maxClaimableAmount: cc.maxClaimableAmount
                }),
                signature: cc.signature,
                totalClaimed: cc.totalClaimed
            });
        }

        bytes32[] memory creditLeaves = new bytes32[](m);
        for (uint256 j = 0; j < m; ++j) {
            Credit calldata c = credits[j];
            if (c.receiver == address(0)) revert InvalidCreditReceiver();
            if (c.amount == 0) revert ZeroCredit();
            if (j != 0) {
                Credit calldata p = credits[j - 1];
                if (
                    c.receiver < p.receiver ||
                    (c.receiver == p.receiver && c.token <= p.token)
                ) {
                    revert UnsortedOrDuplicateCredit();
                }
            }

            withdrawable[c.receiver][c.token] += c.amount;
            totalOutstanding[c.token] += c.amount;

            uint256 t = _findOrAddToken(tokens, tokenCount, c.token);
            if (t == tokenCount) ++tokenCount;
            creditedDelta[t] += c.amount;

            creditLeaves[j] = keccak256(
                abi.encode(c.receiver, c.token, c.amount)
            );

            emit Credited(c.receiver, c.token, c.amount);
        }

        bytes32 batchCommitment = keccak256(
            abi.encode(
                DOMAIN_SEPARATOR,
                keccak256(abi.encodePacked(claimLeaves)),
                keccak256(abi.encodePacked(creditLeaves))
            )
        );
        if (!VERIFIER.verifyAttribution(proof, batchCommitment))
            revert InvalidAttributionProof();
        emit BatchProven(batchCommitment, msg.sender);

        // Redundant with the proof; defense in depth.
        for (uint256 t = 0; t < tokenCount; ++t) {
            if (claimedDelta[t] != creditedDelta[t])
                revert ConservationMismatch();
        }

        X402_BATCH_SETTLEMENT.claim(voucherClaims);
        for (uint256 t = 0; t < tokenCount; ++t) {
            X402_BATCH_SETTLEMENT.settle(address(this), tokens[t]);
            if (
                IERC20(tokens[t]).balanceOf(address(this)) <
                totalOutstanding[tokens[t]]
            ) {
                revert GatewayInsolvent();
            }
        }
    }

    /// @notice Cooperative refund of unclaimed channel escrow to `config.payer`. Operator-only:
    ///         refunding early forfeits amounts earned but not yet claimed.
    function refundChannel(
        x402BatchSettlement.ChannelConfig calldata config,
        uint128 amount
    ) external nonReentrant {
        if (msg.sender != OPERATOR) revert NotOperator();
        X402_BATCH_SETTLEMENT.refund(config, amount);
    }

    /// @notice Transfers a receiver's accrued balance for a token to the receiver.
    ///         Permissionless; the caller cannot redirect funds.
    function withdraw(address receiver, address token) external nonReentrant {
        uint128 amount = withdrawable[receiver][token];
        if (amount == 0) revert NothingToWithdraw();

        withdrawable[receiver][token] = 0;
        totalOutstanding[token] -= amount;

        emit Withdrawn(receiver, token, msg.sender, amount);

        IERC20(token).safeTransfer(receiver, amount);
    }

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
