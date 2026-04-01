// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {EIP712} from "solady/utils/EIP712.sol";

interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external;
}

/**
 * @title DeferredEscrow
 * @notice Service-registry escrow for deferred payment channels.
 * @dev Servers register as services with a mutable payTo address. Clients deposit
 *      funds into subchannels identified by (serviceId, payer) and sign off-chain
 *      cumulative vouchers. The server accumulates vouchers and claims them onchain;
 *      claimed funds are transferred to the service's current payTo via settle().
 */
contract DeferredEscrow is EIP712 {

    // =========================================================================
    // Structs
    // =========================================================================

    struct Service {
        address token;
        uint64  withdrawWindow;
        bool    registered;
        address payTo;
        uint128 unsettled;
        uint256 adminNonce;
    }

    struct Subchannel {
        uint128 deposit;
        uint128 totalClaimed;
        uint64  nonce;
        uint64  withdrawRequestedAt;
    }

    struct VoucherClaim {
        address payer;
        uint128 cumulativeAmount;
        uint128 claimAmount;
        uint64  nonce;
        bytes   signature;
    }

    // =========================================================================
    // Constants — EIP-712 Type Hashes
    // =========================================================================

    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("Voucher(bytes32 serviceId,address payer,uint128 cumulativeAmount,uint64 nonce)");

    bytes32 public constant REQUEST_WITHDRAWAL_TYPEHASH =
        keccak256("RequestWithdrawal(bytes32 serviceId,address payer)");

    bytes32 public constant ADD_AUTHORIZER_TYPEHASH =
        keccak256("AddAuthorizer(bytes32 serviceId,address newAuthorizer,uint256 nonce)");

    bytes32 public constant REMOVE_AUTHORIZER_TYPEHASH =
        keccak256("RemoveAuthorizer(bytes32 serviceId,address target,uint256 nonce)");

    bytes32 public constant UPDATE_PAY_TO_TYPEHASH =
        keccak256("UpdatePayTo(bytes32 serviceId,address newPayTo,uint256 nonce)");

    bytes32 public constant UPDATE_WITHDRAW_WINDOW_TYPEHASH =
        keccak256("UpdateWithdrawWindow(bytes32 serviceId,uint64 newWindow,uint256 nonce)");

    // =========================================================================
    // State
    // =========================================================================

    mapping(bytes32 => Service) public services;
    mapping(bytes32 => mapping(address => bool)) public authorizers;
    mapping(bytes32 => mapping(address => Subchannel)) public subchannels;

    // =========================================================================
    // Events
    // =========================================================================

    event ServiceRegistered(
        bytes32 indexed serviceId,
        address indexed payTo,
        address token,
        address authorizer,
        uint64 withdrawWindow
    );
    event AuthorizerAdded(bytes32 indexed serviceId, address indexed newAuthorizer);
    event AuthorizerRemoved(bytes32 indexed serviceId, address indexed target);
    event PayToUpdated(bytes32 indexed serviceId, address indexed newPayTo);
    event WithdrawWindowUpdated(bytes32 indexed serviceId, uint64 newWindow);
    event Deposited(
        bytes32 indexed serviceId,
        address indexed payer,
        uint128 amount,
        uint128 newDeposit
    );
    event Claimed(
        bytes32 indexed serviceId,
        uint128 totalDelta,
        uint128 newUnsettled
    );
    event Settled(
        bytes32 indexed serviceId,
        address indexed payTo,
        uint128 amount
    );
    event WithdrawalRequested(
        bytes32 indexed serviceId,
        address indexed payer,
        uint64 withdrawEligibleAt
    );
    event Withdrawn(
        bytes32 indexed serviceId,
        address indexed payer,
        uint128 refund
    );

    // =========================================================================
    // Errors
    // =========================================================================

    error ServiceAlreadyRegistered();
    error ServiceNotRegistered();
    error InvalidPayTo();
    error InvalidAuthorizer();
    error ZeroDeposit();
    error DepositOverflow();
    error TransferFailed();
    error InvalidSignature();
    error NotAuthorizer();
    error LastAuthorizer();
    error ClaimAmountExceedsCumulativeAmount();
    error ClaimAmountExceedsDeposit();
    error ClaimAmountNotIncreasing();
    error NonceNotIncreasing();
    error NothingToSettle();
    error NotPayer();
    error WithdrawalAlreadyRequested();
    error WithdrawalNotRequested();
    error WithdrawWindowNotElapsed();
    error NothingToWithdraw();

    // =========================================================================
    // EIP-712 Domain
    // =========================================================================

    function _domainNameAndVersion()
        internal
        pure
        override
        returns (string memory name, string memory version)
    {
        name = "Deferred Escrow";
        version = "1";
    }

    // =========================================================================
    // Service Registration
    // =========================================================================

    /**
     * @notice Register a new service. First-come-first-serve on serviceId.
     * @param serviceId  Chosen by the server
     * @param payTo      Initial payout address
     * @param token      ERC-20 token the service accepts
     * @param authorizer Initial authorizer address
     * @param withdrawWindow Seconds between requestWithdrawal and withdraw eligibility
     */
    function register(
        bytes32 serviceId,
        address payTo,
        address token,
        address authorizer,
        uint64 withdrawWindow
    ) external {
        if (services[serviceId].registered) {
            revert ServiceAlreadyRegistered();
        }
        if (payTo == address(0)) {
            revert InvalidPayTo();
        }
        if (authorizer == address(0)) {
            revert InvalidAuthorizer();
        }

        services[serviceId] = Service({
            token: token,
            withdrawWindow: withdrawWindow,
            registered: true,
            payTo: payTo,
            unsettled: 0,
            adminNonce: 0
        });
        authorizers[serviceId][authorizer] = true;

        emit ServiceRegistered(serviceId, payTo, token, authorizer, withdrawWindow);
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
    function addAuthorizer(
        bytes32 serviceId,
        address newAuthorizer,
        bytes calldata authSignature
    ) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();
        if (newAuthorizer == address(0)) revert InvalidAuthorizer();

        uint256 currentNonce = svc.adminNonce;
        bytes32 structHash = keccak256(
            abi.encode(ADD_AUTHORIZER_TYPEHASH, serviceId, newAuthorizer, currentNonce)
        );
        address signer = ECDSA.recoverCalldata(_hashTypedData(structHash), authSignature);
        if (!authorizers[serviceId][signer]) revert NotAuthorizer();

        svc.adminNonce = currentNonce + 1;
        authorizers[serviceId][newAuthorizer] = true;

        emit AuthorizerAdded(serviceId, newAuthorizer);
    }

    /**
     * @notice Remove an authorizer from a service. At least one must remain.
     * @param serviceId      Target service
     * @param target         Address to remove
     * @param authSignature  EIP-712 RemoveAuthorizer signature from an existing authorizer
     */
    function removeAuthorizer(
        bytes32 serviceId,
        address target,
        bytes calldata authSignature
    ) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        uint256 currentNonce = svc.adminNonce;
        bytes32 structHash = keccak256(
            abi.encode(REMOVE_AUTHORIZER_TYPEHASH, serviceId, target, currentNonce)
        );
        address signer = ECDSA.recoverCalldata(_hashTypedData(structHash), authSignature);
        if (!authorizers[serviceId][signer]) revert NotAuthorizer();
        if (signer == target) revert LastAuthorizer();

        svc.adminNonce = currentNonce + 1;
        authorizers[serviceId][target] = false;

        emit AuthorizerRemoved(serviceId, target);
    }

    /**
     * @notice Update the service's payout address.
     * @param serviceId      Target service
     * @param newPayTo       New payout address
     * @param authSignature  EIP-712 UpdatePayTo signature from an existing authorizer
     */
    function updatePayTo(
        bytes32 serviceId,
        address newPayTo,
        bytes calldata authSignature
    ) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();
        if (newPayTo == address(0)) revert InvalidPayTo();

        uint256 currentNonce = svc.adminNonce;
        bytes32 structHash = keccak256(
            abi.encode(UPDATE_PAY_TO_TYPEHASH, serviceId, newPayTo, currentNonce)
        );
        address signer = ECDSA.recoverCalldata(_hashTypedData(structHash), authSignature);
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
    function updateWithdrawWindow(
        bytes32 serviceId,
        uint64 newWindow,
        bytes calldata authSignature
    ) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        uint256 currentNonce = svc.adminNonce;
        bytes32 structHash = keccak256(
            abi.encode(UPDATE_WITHDRAW_WINDOW_TYPEHASH, serviceId, newWindow, currentNonce)
        );
        address signer = ECDSA.recoverCalldata(_hashTypedData(structHash), authSignature);
        if (!authorizers[serviceId][signer]) revert NotAuthorizer();

        svc.adminNonce = currentNonce + 1;
        svc.withdrawWindow = newWindow;

        emit WithdrawWindowUpdated(serviceId, newWindow);
    }

    // =========================================================================
    // Deposit
    // =========================================================================

    /**
     * @notice Gasless deposit via ERC-3009 receiveWithAuthorization.
     *         Creates or tops up a subchannel. Cancels any pending withdrawal.
     * @param serviceId  Target service
     * @param payer      Client address (must match ERC-3009 from signer)
     * @param amount     Deposit amount (must match ERC-3009 value)
     * @param validAfter  ERC-3009 authorization start time
     * @param validBefore ERC-3009 authorization expiry time
     * @param nonce       ERC-3009 authorization nonce
     * @param signature   ERC-3009 ReceiveWithAuthorization signature from payer
     */
    function depositWithERC3009(
        bytes32 serviceId,
        address payer,
        uint128 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();
        if (amount == 0) revert ZeroDeposit();

        Subchannel storage sub = subchannels[serviceId][payer];

        if (amount > type(uint128).max - sub.deposit) {
            revert DepositOverflow();
        }

        // Effects
        sub.deposit += amount;

        if (sub.withdrawRequestedAt != 0) {
            sub.withdrawRequestedAt = 0;
        }

        // Interaction — receiveWithAuthorization reverts on failure
        IERC3009(svc.token).receiveWithAuthorization(
            payer,
            address(this),
            amount,
            validAfter,
            validBefore,
            nonce,
            signature
        );

        emit Deposited(serviceId, payer, amount, sub.deposit);
    }

    // depositWithPermit2 — future implementation
    // depositWithEIP2612 — future implementation

    // =========================================================================
    // Claim
    // =========================================================================

    /**
     * @notice Validate vouchers and update subchannel accounting. No token transfer.
     * @param serviceId Target service
     * @param claims    Array of VoucherClaim structs to process
     */
    function claim(bytes32 serviceId, VoucherClaim[] calldata claims) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        uint128 totalDelta = 0;

        for (uint256 i = 0; i < claims.length; ++i) {
            VoucherClaim calldata vc = claims[i];
            Subchannel storage sub = subchannels[serviceId][vc.payer];

            if (vc.claimAmount > vc.cumulativeAmount) {
                revert ClaimAmountExceedsCumulativeAmount();
            }
            if (vc.claimAmount > sub.deposit) {
                revert ClaimAmountExceedsDeposit();
            }
            if (vc.claimAmount <= sub.totalClaimed) {
                revert ClaimAmountNotIncreasing();
            }
            if (vc.nonce <= sub.nonce) {
                revert NonceNotIncreasing();
            }

            // Verify EIP-712 Voucher signature from payer
            bytes32 structHash = keccak256(
                abi.encode(VOUCHER_TYPEHASH, serviceId, vc.payer, vc.cumulativeAmount, vc.nonce)
            );
            address signer = ECDSA.recoverCalldata(_hashTypedData(structHash), vc.signature);
            if (signer != vc.payer) revert InvalidSignature();

            uint128 delta = vc.claimAmount - sub.totalClaimed;
            sub.totalClaimed = vc.claimAmount;
            sub.nonce = vc.nonce;
            totalDelta += delta;
        }

        svc.unsettled += totalDelta;

        emit Claimed(serviceId, totalDelta, svc.unsettled);
    }

    // =========================================================================
    // Settle
    // =========================================================================

    /**
     * @notice Transfer all claimed-but-unsettled funds to the service's payTo.
     * @param serviceId Target service
     */
    function settle(bytes32 serviceId) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        uint128 amount = svc.unsettled;
        if (amount == 0) revert NothingToSettle();

        address payTo = svc.payTo;

        // Effects
        svc.unsettled = 0;

        // Interaction
        bool success = IERC20(svc.token).transfer(payTo, amount);
        if (!success) revert TransferFailed();

        emit Settled(serviceId, payTo, amount);
    }

    // =========================================================================
    // Withdrawal Flow
    // =========================================================================

    /**
     * @notice Start the withdrawal countdown. Only the payer can call.
     * @param serviceId Target service
     */
    function requestWithdrawal(bytes32 serviceId) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        Subchannel storage sub = subchannels[serviceId][msg.sender];
        if (sub.deposit == 0) revert NothingToWithdraw();
        if (sub.withdrawRequestedAt != 0) revert WithdrawalAlreadyRequested();

        sub.withdrawRequestedAt = uint64(block.timestamp);

        emit WithdrawalRequested(
            serviceId,
            msg.sender,
            uint64(block.timestamp) + svc.withdrawWindow
        );
    }

    /**
     * @notice Gasless withdrawal request via payer's EIP-712 RequestWithdrawal signature.
     * @param serviceId      Target service
     * @param payer          Client address
     * @param authorization  EIP-712 RequestWithdrawal signature from payer
     */
    function requestWithdrawalFor(
        bytes32 serviceId,
        address payer,
        bytes calldata authorization
    ) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        Subchannel storage sub = subchannels[serviceId][payer];
        if (sub.deposit == 0) revert NothingToWithdraw();
        if (sub.withdrawRequestedAt != 0) revert WithdrawalAlreadyRequested();

        bytes32 structHash = keccak256(
            abi.encode(REQUEST_WITHDRAWAL_TYPEHASH, serviceId, payer)
        );
        address signer = ECDSA.recoverCalldata(_hashTypedData(structHash), authorization);
        if (signer != payer) revert InvalidSignature();

        sub.withdrawRequestedAt = uint64(block.timestamp);

        emit WithdrawalRequested(
            serviceId,
            payer,
            uint64(block.timestamp) + svc.withdrawWindow
        );
    }

    /**
     * @notice Refund unclaimed deposit after the withdraw window. Anyone can call.
     *         Resets the subchannel for future deposits (persistent subchannel).
     * @param serviceId Target service
     * @param payer     Client address
     */
    function withdraw(bytes32 serviceId, address payer) external {
        Service storage svc = services[serviceId];
        if (!svc.registered) revert ServiceNotRegistered();

        Subchannel storage sub = subchannels[serviceId][payer];
        if (sub.withdrawRequestedAt == 0) revert WithdrawalNotRequested();

        bool windowElapsed = block.timestamp >= sub.withdrawRequestedAt + svc.withdrawWindow;
        if (!windowElapsed) revert WithdrawWindowNotElapsed();

        uint128 refund = sub.deposit - sub.totalClaimed;

        // Effects — reset subchannel (not delete, it stays addressable)
        sub.deposit = 0;
        sub.totalClaimed = 0;
        sub.nonce = 0;
        sub.withdrawRequestedAt = 0;

        // service.unsettled is NOT affected — claimed funds stay for settle()

        // Interaction
        if (refund > 0) {
            bool success = IERC20(svc.token).transfer(payer, refund);
            if (!success) revert TransferFailed();
        }

        emit Withdrawn(serviceId, payer, refund);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    /**
     * @notice Read service state.
     */
    function getService(bytes32 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }

    /**
     * @notice Read subchannel state for a (serviceId, payer) pair.
     */
    function getSubchannel(
        bytes32 serviceId,
        address payer
    ) external view returns (Subchannel memory) {
        return subchannels[serviceId][payer];
    }

    /**
     * @notice Check whether an address is an authorizer for a service.
     */
    function isAuthorizer(
        bytes32 serviceId,
        address account
    ) external view returns (bool) {
        return authorizers[serviceId][account];
    }

    /**
     * @notice Get the EIP-712 domain separator.
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    /**
     * @notice Compute the EIP-712 digest for a Voucher (for off-chain signing).
     */
    function getVoucherDigest(
        bytes32 serviceId,
        address payer,
        uint128 cumulativeAmount,
        uint64 nonce
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(VOUCHER_TYPEHASH, serviceId, payer, cumulativeAmount, nonce)
        );
        return _hashTypedData(structHash);
    }

    /**
     * @notice Compute the EIP-712 digest for a RequestWithdrawal (for off-chain signing).
     */
    function getRequestWithdrawalDigest(
        bytes32 serviceId,
        address payer
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(REQUEST_WITHDRAWAL_TYPEHASH, serviceId, payer)
        );
        return _hashTypedData(structHash);
    }
}
