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
 *      The contract uses an initializer pattern instead of constructor parameters
 *      to ensure the same CREATE2 address across all EVM chains, regardless of
 *      the chain's Permit2 deployment address.
 *
 * @author x402 Protocol
 */
abstract contract x402BasePermit2Proxy is ReentrancyGuard {
    /// @notice The Permit2 contract address (set via initialize)
    ISignatureTransfer public PERMIT2;

    /// @notice Whether the contract has been initialized
    bool private _initialized;

    /// @notice EIP-712 type string for witness data
    /// @dev Must match the exact format expected by Permit2
    /// Types must be in ALPHABETICAL order after the primary type (TokenPermissions < Witness)
    string public constant WITNESS_TYPE_STRING =
        "Witness witness)TokenPermissions(address token,uint256 amount)Witness(address to,uint256 validAfter,bytes extra)";

    /// @notice EIP-712 typehash for witness struct
    bytes32 public constant WITNESS_TYPEHASH = keccak256("Witness(address to,uint256 validAfter,bytes extra)");

    /// @notice Emitted when settle() completes successfully
    event Settled();

    /// @notice Emitted when settleWithPermit() completes successfully
    event SettledWithPermit();

    /// @notice Thrown when Permit2 address is zero
    error InvalidPermit2Address();

    /// @notice Thrown when initialize is called more than once
    error AlreadyInitialized();

    /// @notice Thrown when destination address is zero
    error InvalidDestination();

    /// @notice Thrown when payment is attempted before validAfter timestamp
    error PaymentTooEarly();

    /// @notice Thrown when owner address is zero
    error InvalidOwner();

    /// @notice Thrown when EIP-2612 permit value doesn't match Permit2 permitted amount
    error Permit2612AmountMismatch();

    /**
     * @notice Witness data structure for payment authorization
     * @param to Destination address (immutable once signed)
     * @param validAfter Earliest timestamp when payment can be settled
     * @param extra Extensibility field for future use
     * @dev The upper time bound is enforced by Permit2's deadline field
     */
    struct Witness {
        address to;
        uint256 validAfter;
        bytes extra;
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
     * @notice Initializes the proxy with the Permit2 contract address
     * @param _permit2 Address of the Permit2 contract for this chain
     * @dev Can only be called once. Should be called immediately after deployment.
     *      Reverts if _permit2 is the zero address or if already initialized.
     */
    function initialize(
        address _permit2
    ) external {
        if (_initialized) revert AlreadyInitialized();
        if (_permit2 == address(0)) revert InvalidPermit2Address();
        _initialized = true;
        PERMIT2 = ISignatureTransfer(_permit2);
    }

    /**
     * @notice Internal settlement logic shared by all settlement functions
     * @dev Validates all parameters and executes the Permit2 transfer
     * @param permit The Permit2 transfer authorization
     * @param amount The amount to transfer
     * @param owner The token owner (payer)
     * @param witness The witness data containing destination and validity window
     * @param signature The payer's signature
     */
    function _settle(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        uint256 amount,
        address owner,
        Witness calldata witness,
        bytes calldata signature
    ) internal {
        // Validate addresses
        if (owner == address(0)) revert InvalidOwner();
        if (witness.to == address(0)) revert InvalidDestination();

        // Validate time window (upper bound enforced by Permit2's deadline)
        if (block.timestamp < witness.validAfter) revert PaymentTooEarly();

        // Prepare transfer details with destination from witness
        ISignatureTransfer.SignatureTransferDetails memory transferDetails =
            ISignatureTransfer.SignatureTransferDetails({to: witness.to, requestedAmount: amount});

        // Reconstruct witness hash to enforce integrity
        bytes32 witnessHash =
            keccak256(abi.encode(WITNESS_TYPEHASH, witness.to, witness.validAfter, keccak256(witness.extra)));

        // Execute transfer via Permit2
        PERMIT2.permitWitnessTransferFrom(permit, transferDetails, owner, witnessHash, WITNESS_TYPE_STRING, signature);
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
            owner, address(PERMIT2), permit2612.value, permit2612.deadline, permit2612.v, permit2612.r, permit2612.s
        ) {
            // EIP-2612 permit succeeded
        } catch {
            // Permit2 settlement will fail if approval doesn't exist
        }
    }
}
