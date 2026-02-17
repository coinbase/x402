// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {ISignatureTransfer} from "./interfaces/ISignatureTransfer.sol";

/**
 * @title x402BasePermit2Proxy
 * @notice Abstract base contract for x402 payments using Permit2
 *
 * @dev This contract provides the shared logic for x402 payment proxies.
 *      It acts as the authorized spender in Permit2 signatures and uses the
 *      "witness" pattern to cryptographically bind the payment destination,
 *      preventing facilitators from redirecting funds.
 *
 *      The Permit2 address is passed as a constructor argument and stored as
 *      an immutable. Since Permit2 is deployed via a deterministic CREATE2
 *      deployer, its canonical address (0x000000000022D473030F116dDEE9F6B43aC78BA3)
 *      is the same on all EVM chains. Using the same constructor argument on
 *      every chain keeps the initCode identical, preserving a uniform CREATE2
 *      address for these proxies across all chains.
 *
 * @author x402 Protocol
 */
abstract contract x402BasePermit2Proxy is ReentrancyGuard {
    /// @notice The Permit2 contract address (set once at construction, immutable)
    ISignatureTransfer public immutable permit2;

    /// @notice EIP-712 type string for witness data
    /// @dev Must match the exact format expected by Permit2
    /// Types must be in ALPHABETICAL order after the primary type (TokenPermissions < Witness)
    string public constant WITNESS_TYPE_STRING =
        "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,address facilitator,uint256 validAfter)";

    /// @notice EIP-712 typehash for witness struct
    bytes32 public constant WITNESS_TYPEHASH = keccak256("Witness(address to,address facilitator,uint256 validAfter)");

    /// @notice Emitted when settle() completes successfully
    event Settled();

    /// @notice Emitted when settleWithPermit() completes successfully
    event SettledWithPermit();

    /// @notice Emitted when EIP-2612 permit() reverts with an Error(string) reason
    /// @param token The token whose permit() was called
    /// @param owner The token owner for whom permit was attempted
    /// @param reason The human-readable revert reason string
    event EIP2612PermitFailedWithReason(address indexed token, address indexed owner, string reason);

    /// @notice Emitted when EIP-2612 permit() reverts with a Panic(uint256) code
    /// @param token The token whose permit() was called
    /// @param owner The token owner for whom permit was attempted
    /// @param errorCode The Solidity panic code (e.g. 0x11 for overflow, 0x01 for assert)
    event EIP2612PermitFailedWithPanic(address indexed token, address indexed owner, uint256 errorCode);

    /// @notice Emitted when EIP-2612 permit() reverts with a custom error or empty data
    /// @param token The token whose permit() was called
    /// @param owner The token owner for whom permit was attempted
    /// @param data The raw revert data (custom error selector + params, or empty)
    event EIP2612PermitFailedWithData(address indexed token, address indexed owner, bytes data);

    /// @notice Thrown when Permit2 address is zero
    error InvalidPermit2Address();

    /// @notice Thrown when destination address is zero
    error InvalidDestination();

    /// @notice Thrown when payment is attempted before validAfter timestamp
    error PaymentTooEarly();

    /// @notice Thrown when owner address is zero
    error InvalidOwner();

    /// @notice Thrown when settlement amount is zero
    error InvalidAmount();

    /// @notice Thrown when EIP-2612 permit value doesn't match Permit2 permitted amount
    error Permit2612AmountMismatch();

    /// @notice Thrown when msg.sender does not match the facilitator in the witness
    error UnauthorizedFacilitator();

    /**
     * @notice Witness data structure for payment authorization
     * @param to Destination address (immutable once signed)
     * @param facilitator Address authorized to settle this payment (must be msg.sender)
     * @param validAfter Earliest timestamp when payment can be settled
     * @dev The upper time bound is enforced by Permit2's deadline field.
     *      The facilitator field prevents frontrunning/griefing by binding the
     *      settlement caller to the payer's signature.
     */
    struct Witness {
        address to;
        address facilitator;
        uint256 validAfter;
    }

    /**
     * @notice EIP-2612 permit parameters grouped to reduce stack depth
     * @param value Approval amount for Permit2
     * @param deadline Permit expiration timestamp
     * @param r ECDSA signature parameter
     * @param s ECDSA signature parameter
     * @param v ECDSA signature parameter
     */
    struct EIP2612Permit {
        uint256 value;
        uint256 deadline;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    /**
     * @notice Constructs the proxy with the Permit2 contract address
     * @param _permit2 Address of the Permit2 contract (canonical on all EVM chains)
     * @dev The Permit2 address is stored as an immutable, eliminating any post-deployment
     *      initialization race. Using the same canonical Permit2 address on every chain
     *      keeps the initCode identical, preserving CREATE2 address determinism.
     */
    constructor(
        address _permit2
    ) {
        if (_permit2 == address(0)) revert InvalidPermit2Address();
        permit2 = ISignatureTransfer(_permit2);
    }

    /**
     * @notice Internal settlement logic shared by all settlement functions
     * @dev Validates all parameters and executes the Permit2 transfer
     * @param permit The Permit2 transfer authorization
     * @param settlementAmount The actual amount to transfer (may be <= permit.permitted.amount)
     * @param owner The token owner (payer)
     * @param witness The witness data containing destination and validity window
     * @param signature The payer's signature
     */
    function _settle(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        uint256 settlementAmount,
        address owner,
        Witness calldata witness,
        bytes calldata signature
    ) internal {
        // Validate amount is non-zero to prevent no-op settlements that consume nonces
        if (settlementAmount == 0) revert InvalidAmount();

        // Validate addresses
        if (owner == address(0)) revert InvalidOwner();
        if (witness.to == address(0)) revert InvalidDestination();

        // Validate caller is the authorized facilitator signed over by the payer
        if (msg.sender != witness.facilitator) revert UnauthorizedFacilitator();

        // Validate time window (upper bound enforced by Permit2's deadline)
        if (block.timestamp < witness.validAfter) revert PaymentTooEarly();

        // Prepare transfer details with destination from witness
        ISignatureTransfer.SignatureTransferDetails memory transferDetails =
            ISignatureTransfer.SignatureTransferDetails({to: witness.to, requestedAmount: settlementAmount});

        // Reconstruct witness hash to enforce integrity
        bytes32 witnessHash =
            keccak256(abi.encode(WITNESS_TYPEHASH, witness.to, witness.facilitator, witness.validAfter));

        // Execute transfer via Permit2
        permit2.permitWitnessTransferFrom(permit, transferDetails, owner, witnessHash, WITNESS_TYPE_STRING, signature);
    }

    /**
     * @notice Validates and attempts to execute an EIP-2612 permit to approve Permit2
     * @dev Reverts if permit2612.value does not match permittedAmount.
     *      The actual permit call does not revert on failure because the approval
     *      might already exist or the token might not support EIP-2612.
     * @param token The token address
     * @param owner The token owner
     * @param permit2612 The EIP-2612 permit parameters
     * @param permittedAmount The Permit2 permitted amount
     */
    function _executePermit(
        address token,
        address owner,
        EIP2612Permit calldata permit2612,
        uint256 permittedAmount
    ) internal {
        if (permit2612.value != permittedAmount) revert Permit2612AmountMismatch();

        try IERC20Permit(token).permit(
            owner, address(permit2), permit2612.value, permit2612.deadline, permit2612.v, permit2612.r, permit2612.s
        ) {
            // EIP-2612 permit succeeded
        } catch Error(string memory reason) {
            // Legacy revert(string) or require(condition, string) — e.g. older token implementations
            emit EIP2612PermitFailedWithReason(token, owner, reason);
        } catch Panic(uint256 errorCode) {
            // Solidity panic — e.g. arithmetic overflow in non-standard implementations
            emit EIP2612PermitFailedWithPanic(token, owner, errorCode);
        } catch (bytes memory data) {
            // Custom errors (e.g. OZ v5 ERC2612ExpiredSignature, ERC2612InvalidSigner),
            // empty reverts, or out-of-gas from non-EIP-2612 tokens
            emit EIP2612PermitFailedWithData(token, owner, data);
        }
    }
}
