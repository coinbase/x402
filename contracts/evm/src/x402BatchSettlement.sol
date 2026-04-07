// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ISignatureTransfer} from "./interfaces/ISignatureTransfer.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/**
 * @title x402BatchSettlement
 * @notice Service-registry escrow for batched payment channels.
 *
 * @dev Servers register as services. Clients deposit funds into subchannels
 *      identified by (serviceId, payer, token) and sign off-chain cumulative
 *      vouchers. The server accumulates vouchers and batch-claims them onchain;
 *      claimed funds are transferred to the service's payTo address via settle().
 *
 *      Supports three gasless deposit methods:
 *        - EIP-3009 (receiveWithAuthorization) for tokens like USDC
 *        - Permit2 (ISignatureTransfer) for any ERC-20 with Permit2 approval
 *        - EIP-2612 + Permit2 for tokens supporting EIP-2612 permits
 *
 * @author x402 Protocol
 */
contract x402BatchSettlement is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =========================================================================
    // Structs
    // =========================================================================

    struct Service {
        uint64 withdrawWindow;
        bool registered;
        address payTo;
        uint256 adminNonce;
    }

    struct Subchannel {
        uint128 deposit;
        uint128 totalClaimed;
        uint64 nonce;
        uint64 withdrawRequestedAt;
        uint64 withdrawNonce;
    }

    struct VoucherClaim {
        address payer;
        uint128 cumulativeAmount;
        uint128 claimAmount;
        uint64 nonce;
        bytes signature;
    }

    struct CooperativeWithdrawRequest {
        address payer;
        bytes authorizerSignature;
    }

    struct DepositWitness {
        bytes32 serviceId;
    }

    struct EIP2612Permit {
        uint256 value;
        uint256 deadline;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    // =========================================================================
    // Constants
    // =========================================================================

    uint64 public constant MIN_WITHDRAW_WINDOW = 15 minutes;
    uint64 public constant MAX_WITHDRAW_WINDOW = 30 days;

    // =========================================================================
    // Constants — EIP-712 Type Hashes
    // =========================================================================

    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("Voucher(bytes32 serviceId,address payer,address token,uint128 cumulativeAmount,uint64 nonce)");

    bytes32 public constant COOPERATIVE_WITHDRAW_TYPEHASH =
        keccak256("CooperativeWithdraw(bytes32 serviceId,address payer,address token,uint64 withdrawNonce)");

    bytes32 public constant REQUEST_WITHDRAWAL_TYPEHASH =
        keccak256("RequestWithdrawal(bytes32 serviceId,address payer,address token,uint64 withdrawNonce)");

    bytes32 public constant REGISTER_TYPEHASH =
        keccak256("Register(bytes32 serviceId,address payTo,address authorizer,uint64 withdrawWindow)");

    bytes32 public constant AUTHORIZE_CLIENT_SIGNER_TYPEHASH =
        keccak256("AuthorizeClientSigner(bytes32 serviceId,address payer,address signer,uint256 nonce)");

    bytes32 public constant REVOKE_CLIENT_SIGNER_TYPEHASH =
        keccak256("RevokeClientSigner(bytes32 serviceId,address payer,address signer,uint256 nonce)");

    bytes32 public constant ADD_AUTHORIZER_TYPEHASH =
        keccak256("AddAuthorizer(bytes32 serviceId,address newAuthorizer,uint256 nonce)");

    bytes32 public constant REMOVE_AUTHORIZER_TYPEHASH =
        keccak256("RemoveAuthorizer(bytes32 serviceId,address target,uint256 nonce)");

    bytes32 public constant UPDATE_PAY_TO_TYPEHASH =
        keccak256("UpdatePayTo(bytes32 serviceId,address newPayTo,uint256 nonce)");

    bytes32 public constant UPDATE_WITHDRAW_WINDOW_TYPEHASH =
        keccak256("UpdateWithdrawWindow(bytes32 serviceId,uint64 newWindow,uint256 nonce)");

    string public constant DEPOSIT_WITNESS_TYPE_STRING =
        "DepositWitness witness)TokenPermissions(address token,uint256 amount)DepositWitness(bytes32 serviceId)";

    bytes32 public constant DEPOSIT_WITNESS_TYPEHASH = keccak256("DepositWitness(bytes32 serviceId)");

    // =========================================================================
    // Immutables
    // =========================================================================

    /// @notice Canonical Permit2 contract
    ISignatureTransfer public immutable PERMIT2;

    // =========================================================================
    // State
    // =========================================================================

    mapping(bytes32 => Service) public services;
    mapping(bytes32 => mapping(address => bool)) public authorizers;
    mapping(bytes32 => uint256) public authorizerCount;
    mapping(bytes32 => mapping(address => mapping(address => Subchannel))) public subchannels;
    mapping(bytes32 => mapping(address => uint128)) public unsettled;
    mapping(bytes32 => mapping(address => mapping(address => bool))) public clientSigners;
    mapping(bytes32 => mapping(address => uint256)) public clientNonces;

    // =========================================================================
    // Events
    // =========================================================================

    event ServiceRegistered(
        bytes32 indexed serviceId, address indexed payTo, address authorizer, uint64 withdrawWindow
    );
    event AuthorizerAdded(bytes32 indexed serviceId, address indexed newAuthorizer);
    event AuthorizerRemoved(bytes32 indexed serviceId, address indexed target);
    event PayToUpdated(bytes32 indexed serviceId, address indexed newPayTo);
    event WithdrawWindowUpdated(bytes32 indexed serviceId, uint64 newWindow);
    event Deposited(bytes32 indexed serviceId, address indexed payer, address indexed token, uint128 amount, uint128 newDeposit);
    event Claimed(bytes32 indexed serviceId, address indexed token, uint128 totalDelta, uint128 newUnsettled);
    event Settled(bytes32 indexed serviceId, address indexed token, address indexed payTo, uint128 amount);
    event WithdrawalRequested(bytes32 indexed serviceId, address indexed payer, address indexed token, uint64 withdrawEligibleAt);
    event Withdrawn(bytes32 indexed serviceId, address indexed payer, address indexed token, uint128 refund);
    event ClientSignerAuthorized(bytes32 indexed serviceId, address indexed payer, address indexed signer);
    event ClientSignerRevoked(bytes32 indexed serviceId, address indexed payer, address indexed signer);

    event EIP2612PermitFailedWithReason(address indexed token, address indexed owner, string reason);
    event EIP2612PermitFailedWithPanic(address indexed token, address indexed owner, uint256 errorCode);
    event EIP2612PermitFailedWithData(address indexed token, address indexed owner, bytes data);

    // =========================================================================
    // Errors
    // =========================================================================

    error ServiceAlreadyRegistered();
    error ServiceNotRegistered();
    error InvalidPayTo();
    error InvalidAuthorizer();
    error ZeroDeposit();
    error DepositOverflow();
    error InvalidSignature();
    error NotAuthorizer();
    error LastAuthorizer();
    error ClaimAmountExceedsCumulativeAmount();
    error ClaimAmountExceedsDeposit();
    error ClaimAmountNotIncreasing();
    error NonceNotIncreasing();
    error NothingToSettle();
    error WithdrawalAlreadyRequested();
    error WithdrawalNotRequested();
    error WithdrawWindowNotElapsed();
    error NothingToWithdraw();
    error InvalidPermit2Address();
    error Permit2612AmountMismatch();
    error InvalidSigner();
    error WithdrawWindowOutOfRange();

    // =========================================================================
    // Constructor
    // =========================================================================

    /**
     * @param _permit2 Canonical Permit2 address (0x000000000022D473030F116dDEE9F6B43aC78BA3)
     */
    constructor(address _permit2) EIP712("Batch Settlement", "1") {
        if (_permit2 == address(0)) revert InvalidPermit2Address();
        PERMIT2 = ISignatureTransfer(_permit2);
    }

    // =========================================================================
    // Service Registration
    // =========================================================================

    /**
     * @notice Register a new service. First-come-first-serve on serviceId.
     * @param serviceId  Chosen by the server (typically a keccak256 hash)
     * @param payTo      Initial payout address
     * @param authorizer Initial authorizer address
     * @param withdrawWindow Seconds between requestWithdrawal and withdraw eligibility
     */
    function register(bytes32 serviceId, address payTo, address authorizer, uint64 withdrawWindow) external {
        _register(serviceId, payTo, authorizer, withdrawWindow);
    }

    /**
     * @notice Gasless registration — anyone can submit, authorizer signs the intent.
     * @param serviceId  Chosen service id
     * @param payTo      Initial payout address
     * @param authorizer Initial authorizer address (must be the signer)
     * @param withdrawWindow Seconds between requestWithdrawal and withdraw eligibility
     * @param signature  EIP-712 Register signature from the authorizer
     */
    function registerFor(
        bytes32 serviceId,
        address payTo,
        address authorizer,
        uint64 withdrawWindow,
        bytes calldata signature
    ) external {
        bytes32 structHash =
            keccak256(abi.encode(REGISTER_TYPEHASH, serviceId, payTo, authorizer, withdrawWindow));
        address signer = _recoverSigner(structHash, signature);
        if (signer != authorizer) revert InvalidSignature();

        _register(serviceId, payTo, authorizer, withdrawWindow);
    }

    function _register(bytes32 serviceId, address payTo, address authorizer, uint64 withdrawWindow) internal {
        if (services[serviceId].registered) revert ServiceAlreadyRegistered();
        if (payTo == address(0)) revert InvalidPayTo();
        if (authorizer == address(0)) revert InvalidAuthorizer();
        if (withdrawWindow < MIN_WITHDRAW_WINDOW || withdrawWindow > MAX_WITHDRAW_WINDOW) {
            revert WithdrawWindowOutOfRange();
        }

        services[serviceId] =
            Service({withdrawWindow: withdrawWindow, registered: true, payTo: payTo, adminNonce: 0});
        authorizers[serviceId][authorizer] = true;
        authorizerCount[serviceId] = 1;

        emit ServiceRegistered(serviceId, payTo, authorizer, withdrawWindow);
    }

    // =========================================================================
    // Deposits
    // =========================================================================

    /**
     * @notice Gasless deposit via ERC-3009 receiveWithAuthorization.
     * @param serviceId  Target service
     * @param payer      Client address (must match ERC-3009 from signer)
     * @param token      ERC-20 token address
     * @param amount     Deposit amount
     * @param validAfter  ERC-3009 authorization start time
     * @param validBefore ERC-3009 authorization expiry time
     * @param nonce       ERC-3009 authorization nonce
     * @param signature   ERC-3009 ReceiveWithAuthorization signature from payer
     */
    function depositWithERC3009(
        bytes32 serviceId,
        address payer,
        address token,
        uint128 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant {
        _validateDeposit(serviceId, amount);

        // CEI: external call first, then state updates
        IERC3009(token).receiveWithAuthorization(payer, address(this), amount, validAfter, validBefore, nonce, signature);

        Subchannel storage sub = _applyDeposit(serviceId, payer, token, amount);
        emit Deposited(serviceId, payer, token, amount, sub.deposit);
    }

    /**
     * @notice Gasless deposit via Permit2 (ISignatureTransfer).
     * @dev Requires the payer to have approved Permit2 for the token (via prior ERC-20
     *      approve, ERC-20 approve gas sponsoring, or other means).
     * @param permit  Permit2 transfer authorization
     * @param owner   Token owner (payer)
     * @param witness Deposit witness binding the serviceId
     * @param signature Payer's Permit2 signature
     */
    function depositWithPermit2(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        address owner,
        DepositWitness calldata witness,
        bytes calldata signature
    ) external nonReentrant {
        bytes32 serviceId = witness.serviceId;
        address token = permit.permitted.token;
        uint128 amount = _safeToUint128(permit.permitted.amount);

        _validateDeposit(serviceId, amount);

        bytes32 witnessHash = keccak256(abi.encode(DEPOSIT_WITNESS_TYPEHASH, witness.serviceId));

        PERMIT2.permitWitnessTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: permit.permitted.amount}),
            owner,
            witnessHash,
            DEPOSIT_WITNESS_TYPE_STRING,
            signature
        );

        Subchannel storage sub = _applyDeposit(serviceId, owner, token, amount);
        emit Deposited(serviceId, owner, token, amount, sub.deposit);
    }

    /**
     * @notice Gasless deposit via EIP-2612 permit + Permit2.
     * @dev First attempts the EIP-2612 permit to approve Permit2, then calls
     *      Permit2.permitWitnessTransferFrom. The EIP-2612 permit failure is
     *      non-fatal (approval may already exist).
     * @param permit2612 EIP-2612 permit parameters
     * @param permit     Permit2 transfer authorization
     * @param owner      Token owner (payer)
     * @param witness    Deposit witness binding the serviceId
     * @param signature  Payer's Permit2 signature
     */
    function depositWithPermit2AndEIP2612(
        EIP2612Permit calldata permit2612,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        address owner,
        DepositWitness calldata witness,
        bytes calldata signature
    ) external nonReentrant {
        bytes32 serviceId = witness.serviceId;
        address token = permit.permitted.token;
        uint128 amount = _safeToUint128(permit.permitted.amount);

        _validateDeposit(serviceId, amount);

        _executePermit(token, owner, permit2612, permit.permitted.amount);

        bytes32 witnessHash = keccak256(abi.encode(DEPOSIT_WITNESS_TYPEHASH, witness.serviceId));

        PERMIT2.permitWitnessTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: permit.permitted.amount}),
            owner,
            witnessHash,
            DEPOSIT_WITNESS_TYPE_STRING,
            signature
        );

        Subchannel storage sub = _applyDeposit(serviceId, owner, token, amount);
        emit Deposited(serviceId, owner, token, amount, sub.deposit);
    }

    // =========================================================================
    // Claim & Settle
    // =========================================================================

    /**
     * @notice Batch-validate vouchers and update subchannel accounting. No token transfer.
     * @param serviceId Target service
     * @param token     Token for all claims in this batch
     * @param claims    Array of VoucherClaim structs to process
     */
    function claim(bytes32 serviceId, address token, VoucherClaim[] calldata claims) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        uint128 totalDelta = 0;

        for (uint256 i = 0; i < claims.length; ++i) {
            VoucherClaim calldata vc = claims[i];
            Subchannel storage sub = subchannels[serviceId][vc.payer][token];

            if (vc.claimAmount > vc.cumulativeAmount) revert ClaimAmountExceedsCumulativeAmount();
            if (vc.claimAmount > sub.deposit) revert ClaimAmountExceedsDeposit();
            if (vc.claimAmount <= sub.totalClaimed) revert ClaimAmountNotIncreasing();
            if (vc.nonce <= sub.nonce) revert NonceNotIncreasing();

            bytes32 structHash = keccak256(
                abi.encode(VOUCHER_TYPEHASH, serviceId, vc.payer, token, vc.cumulativeAmount, vc.nonce)
            );
            address signer = _recoverSigner(structHash, vc.signature);
            if (signer != vc.payer && !clientSigners[serviceId][vc.payer][signer]) {
                revert InvalidSignature();
            }

            uint128 delta = vc.claimAmount - sub.totalClaimed;
            sub.totalClaimed = vc.claimAmount;
            sub.nonce = vc.nonce;
            totalDelta += delta;
        }

        unsettled[serviceId][token] += totalDelta;

        emit Claimed(serviceId, token, totalDelta, unsettled[serviceId][token]);
    }

    /**
     * @notice Transfer all claimed-but-unsettled funds to the service's payTo.
     * @param serviceId Target service
     * @param token     Token to settle
     */
    function settle(bytes32 serviceId, address token) external nonReentrant {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        uint128 amount = unsettled[serviceId][token];
        if (amount == 0) revert NothingToSettle();

        address payTo = svc.payTo;
        unsettled[serviceId][token] = 0;

        IERC20(token).safeTransfer(payTo, amount);

        emit Settled(serviceId, token, payTo, amount);
    }

    // =========================================================================
    // Client Signer Delegation
    // =========================================================================

    /**
     * @notice Authorize an EOA to sign vouchers on behalf of msg.sender for a service.
     * @param serviceId Target service
     * @param signer    EOA address to authorize
     */
    function authorizeClientSigner(bytes32 serviceId, address signer) external {
        if (signer == address(0)) revert InvalidSigner();
        clientSigners[serviceId][msg.sender][signer] = true;
        emit ClientSignerAuthorized(serviceId, msg.sender, signer);
    }

    /**
     * @notice Revoke an authorized client signer.
     * @param serviceId Target service
     * @param signer    EOA address to revoke
     */
    function revokeClientSigner(bytes32 serviceId, address signer) external {
        clientSigners[serviceId][msg.sender][signer] = false;
        emit ClientSignerRevoked(serviceId, msg.sender, signer);
    }

    /**
     * @notice Gasless authorize — payer signs off-chain, anyone submits.
     * @param serviceId Target service
     * @param payer     The payer (smart contract wallet) authorizing the signer
     * @param signer    EOA address to authorize
     * @param signature EIP-712 AuthorizeClientSigner signature from payer
     */
    function authorizeClientSignerFor(
        bytes32 serviceId,
        address payer,
        address signer,
        bytes calldata signature
    ) external {
        if (signer == address(0)) revert InvalidSigner();

        uint256 currentNonce = clientNonces[serviceId][payer];
        bytes32 structHash =
            keccak256(abi.encode(AUTHORIZE_CLIENT_SIGNER_TYPEHASH, serviceId, payer, signer, currentNonce));
        address recovered = _recoverSigner(structHash, signature);
        if (recovered != payer) revert InvalidSignature();

        clientNonces[serviceId][payer] = currentNonce + 1;
        clientSigners[serviceId][payer][signer] = true;

        emit ClientSignerAuthorized(serviceId, payer, signer);
    }

    /**
     * @notice Gasless revoke — payer signs off-chain, anyone submits.
     * @param serviceId Target service
     * @param payer     The payer revoking the signer
     * @param signer    EOA address to revoke
     * @param signature EIP-712 RevokeClientSigner signature from payer
     */
    function revokeClientSignerFor(
        bytes32 serviceId,
        address payer,
        address signer,
        bytes calldata signature
    ) external {
        uint256 currentNonce = clientNonces[serviceId][payer];
        bytes32 structHash =
            keccak256(abi.encode(REVOKE_CLIENT_SIGNER_TYPEHASH, serviceId, payer, signer, currentNonce));
        address recovered = _recoverSigner(structHash, signature);
        if (recovered != payer) revert InvalidSignature();

        clientNonces[serviceId][payer] = currentNonce + 1;
        clientSigners[serviceId][payer][signer] = false;

        emit ClientSignerRevoked(serviceId, payer, signer);
    }

    // =========================================================================
    // Withdrawal Flow
    // =========================================================================

    /**
     * @notice Start the withdrawal countdown. Only the payer can call.
     * @param serviceId Target service
     * @param token     Token for the subchannel
     */
    function requestWithdrawal(bytes32 serviceId, address token) external {
        _requestWithdrawal(serviceId, msg.sender, token);
    }

    /**
     * @notice Gasless withdrawal request via payer's EIP-712 signature.
     * @dev The signature includes the subchannel's withdrawNonce for replay protection.
     * @param serviceId Target service
     * @param payer     Client address
     * @param token     Token for the subchannel
     * @param signature EIP-712 RequestWithdrawal signature from payer
     */
    function requestWithdrawalFor(
        bytes32 serviceId,
        address payer,
        address token,
        bytes calldata signature
    ) external {
        Subchannel storage sub = subchannels[serviceId][payer][token];
        bytes32 structHash =
            keccak256(abi.encode(REQUEST_WITHDRAWAL_TYPEHASH, serviceId, payer, token, sub.withdrawNonce));
        address signer = _recoverSigner(structHash, signature);
        if (signer != payer) revert InvalidSignature();

        _requestWithdrawal(serviceId, payer, token);
    }

    /**
     * @notice Refund unclaimed deposit after the withdraw window. Anyone can call.
     * @param serviceId Target service
     * @param payer     Client address
     * @param token     Token for the subchannel
     */
    function withdraw(bytes32 serviceId, address payer, address token) external nonReentrant {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        Subchannel storage sub = subchannels[serviceId][payer][token];
        if (sub.withdrawRequestedAt == 0) revert WithdrawalNotRequested();

        bool windowElapsed = block.timestamp >= sub.withdrawRequestedAt + svc.withdrawWindow;
        if (!windowElapsed) revert WithdrawWindowNotElapsed();

        uint128 refund = sub.deposit - sub.totalClaimed;

        sub.deposit = 0;
        sub.totalClaimed = 0;
        sub.withdrawRequestedAt = 0;

        if (refund > 0) {
            IERC20(token).safeTransfer(payer, refund);
        }

        emit Withdrawn(serviceId, payer, token, refund);
    }

    /**
     * @notice Instant cooperative withdrawal signed by an authorizer.
     *         Refunds unclaimed deposit to each payer immediately.
     * @param serviceId Target service
     * @param token     Token for the subchannels
     * @param requests  Array of payer addresses with authorizer signatures
     */
    function cooperativeWithdraw(
        bytes32 serviceId,
        address token,
        CooperativeWithdrawRequest[] calldata requests
    ) external nonReentrant {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        for (uint256 i = 0; i < requests.length; ++i) {
            CooperativeWithdrawRequest calldata req = requests[i];
            Subchannel storage sub = subchannels[serviceId][req.payer][token];

            if (sub.deposit == 0) revert NothingToWithdraw();

            bytes32 structHash = keccak256(
                abi.encode(COOPERATIVE_WITHDRAW_TYPEHASH, serviceId, req.payer, token, sub.withdrawNonce)
            );
            address authSigner = _recoverSigner(structHash, req.authorizerSignature);
            if (!authorizers[serviceId][authSigner]) revert NotAuthorizer();

            uint128 refund = sub.deposit - sub.totalClaimed;

            sub.deposit = 0;
            sub.totalClaimed = 0;
            sub.withdrawRequestedAt = 0;
            sub.withdrawNonce += 1;

            if (refund > 0) {
                IERC20(token).safeTransfer(req.payer, refund);
            }

            emit Withdrawn(serviceId, req.payer, token, refund);
        }
    }

    // =========================================================================
    // Service Management (authorizer-signed)
    // =========================================================================

    /**
     * @notice Add an authorizer to a service.
     * @param serviceId      Target service
     * @param newAuthorizer   Address to add
     * @param authSignature   EIP-712 AddAuthorizer signature from an existing authorizer
     */
    function addAuthorizer(bytes32 serviceId, address newAuthorizer, bytes calldata authSignature) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();
        if (newAuthorizer == address(0)) revert InvalidAuthorizer();

        uint256 currentNonce = svc.adminNonce;
        bytes32 structHash =
            keccak256(abi.encode(ADD_AUTHORIZER_TYPEHASH, serviceId, newAuthorizer, currentNonce));
        address signer = _recoverSigner(structHash, authSignature);
        if (!authorizers[serviceId][signer]) revert NotAuthorizer();

        svc.adminNonce = currentNonce + 1;
        if (!authorizers[serviceId][newAuthorizer]) {
            authorizers[serviceId][newAuthorizer] = true;
            authorizerCount[serviceId] += 1;
        }

        emit AuthorizerAdded(serviceId, newAuthorizer);
    }

    /**
     * @notice Remove an authorizer from a service. At least one must remain.
     * @param serviceId      Target service
     * @param target         Address to remove
     * @param authSignature  EIP-712 RemoveAuthorizer signature from an existing authorizer
     */
    function removeAuthorizer(bytes32 serviceId, address target, bytes calldata authSignature) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        uint256 currentNonce = svc.adminNonce;
        bytes32 structHash = keccak256(abi.encode(REMOVE_AUTHORIZER_TYPEHASH, serviceId, target, currentNonce));
        address signer = _recoverSigner(structHash, authSignature);
        if (!authorizers[serviceId][signer]) revert NotAuthorizer();
        if (authorizerCount[serviceId] <= 1) revert LastAuthorizer();

        svc.adminNonce = currentNonce + 1;
        authorizers[serviceId][target] = false;
        authorizerCount[serviceId] -= 1;

        emit AuthorizerRemoved(serviceId, target);
    }

    /**
     * @notice Update the service's payout address.
     * @param serviceId      Target service
     * @param newPayTo       New payout address
     * @param authSignature  EIP-712 UpdatePayTo signature from an existing authorizer
     */
    function updatePayTo(bytes32 serviceId, address newPayTo, bytes calldata authSignature) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();
        if (newPayTo == address(0)) revert InvalidPayTo();

        uint256 currentNonce = svc.adminNonce;
        bytes32 structHash = keccak256(abi.encode(UPDATE_PAY_TO_TYPEHASH, serviceId, newPayTo, currentNonce));
        address signer = _recoverSigner(structHash, authSignature);
        if (!authorizers[serviceId][signer]) revert NotAuthorizer();

        svc.adminNonce = currentNonce + 1;
        svc.payTo = newPayTo;

        emit PayToUpdated(serviceId, newPayTo);
    }

    /**
     * @notice Update the service's withdrawal window.
     * @param serviceId      Target service
     * @param newWindow      New withdrawal window in seconds
     * @param authSignature  EIP-712 UpdateWithdrawWindow signature from an existing authorizer
     */
    function updateWithdrawWindow(bytes32 serviceId, uint64 newWindow, bytes calldata authSignature) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();
        if (newWindow < MIN_WITHDRAW_WINDOW || newWindow > MAX_WITHDRAW_WINDOW) {
            revert WithdrawWindowOutOfRange();
        }

        uint256 currentNonce = svc.adminNonce;
        bytes32 structHash =
            keccak256(abi.encode(UPDATE_WITHDRAW_WINDOW_TYPEHASH, serviceId, newWindow, currentNonce));
        address signer = _recoverSigner(structHash, authSignature);
        if (!authorizers[serviceId][signer]) revert NotAuthorizer();

        svc.adminNonce = currentNonce + 1;
        svc.withdrawWindow = newWindow;

        emit WithdrawWindowUpdated(serviceId, newWindow);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    function getService(bytes32 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }

    function getSubchannel(bytes32 serviceId, address payer, address token)
        external
        view
        returns (Subchannel memory)
    {
        return subchannels[serviceId][payer][token];
    }

    function getUnsettled(bytes32 serviceId, address token) external view returns (uint128) {
        return unsettled[serviceId][token];
    }

    function isAuthorizer(bytes32 serviceId, address account) external view returns (bool) {
        return authorizers[serviceId][account];
    }

    function isClientSigner(bytes32 serviceId, address payer, address signer) external view returns (bool) {
        return clientSigners[serviceId][payer][signer];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getVoucherDigest(bytes32 serviceId, address payer, address token, uint128 cumulativeAmount, uint64 nonce)
        external
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(VOUCHER_TYPEHASH, serviceId, payer, token, cumulativeAmount, nonce));
        return _hashTypedDataV4(structHash);
    }

    function getCooperativeWithdrawDigest(bytes32 serviceId, address payer, address token, uint64 withdrawNonce)
        external
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(COOPERATIVE_WITHDRAW_TYPEHASH, serviceId, payer, token, withdrawNonce));
        return _hashTypedDataV4(structHash);
    }

    // =========================================================================
    // Internal Helpers
    // =========================================================================

    function _recoverSigner(bytes32 structHash, bytes calldata signature) internal view returns (address) {
        bytes32 digest = _hashTypedDataV4(structHash);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (err != ECDSA.RecoverError.NoError) revert InvalidSignature();
        return recovered;
    }

    function _validateDeposit(bytes32 serviceId, uint128 amount) internal view {
        if (!services[serviceId].registered) revert ServiceNotRegistered();
        if (amount == 0) revert ZeroDeposit();
    }

    function _applyDeposit(bytes32 serviceId, address payer, address token, uint128 amount)
        internal
        returns (Subchannel storage sub)
    {
        sub = subchannels[serviceId][payer][token];
        if (amount > type(uint128).max - sub.deposit) revert DepositOverflow();
        sub.deposit += amount;
        if (sub.withdrawRequestedAt != 0) sub.withdrawRequestedAt = 0;
    }

    function _requestWithdrawal(bytes32 serviceId, address payer, address token) internal {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        Subchannel storage sub = subchannels[serviceId][payer][token];
        if (sub.deposit == 0) revert NothingToWithdraw();
        if (sub.withdrawRequestedAt != 0) revert WithdrawalAlreadyRequested();

        sub.withdrawRequestedAt = uint64(block.timestamp);

        emit WithdrawalRequested(serviceId, payer, token, uint64(block.timestamp) + svc.withdrawWindow);
    }

    function _executePermit(address token, address owner, EIP2612Permit calldata permit2612, uint256 permittedAmount)
        internal
    {
        if (permit2612.value != permittedAmount) revert Permit2612AmountMismatch();

        try IERC20Permit(token).permit(
            owner, address(PERMIT2), permit2612.value, permit2612.deadline, permit2612.v, permit2612.r, permit2612.s
        ) {} catch Error(string memory reason) {
            emit EIP2612PermitFailedWithReason(token, owner, reason);
        } catch Panic(uint256 errorCode) {
            emit EIP2612PermitFailedWithPanic(token, owner, errorCode);
        } catch (bytes memory data) {
            emit EIP2612PermitFailedWithData(token, owner, data);
        }
    }

    function _safeToUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) revert DepositOverflow();
        return uint128(value);
    }
}
