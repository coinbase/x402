"""EVM-specific payload and data types."""

from dataclasses import dataclass
from typing import Any


@dataclass
class ExactEIP3009Authorization:
    """EIP-3009 TransferWithAuthorization data."""

    from_address: str  # 'from' is reserved in Python
    to: str
    value: str  # Amount in smallest unit as string
    valid_after: str  # Unix timestamp as string
    valid_before: str  # Unix timestamp as string
    nonce: str  # 32-byte nonce as hex string (0x...)


@dataclass
class ExactEIP3009Payload:
    """Exact payment payload for EVM networks."""

    authorization: ExactEIP3009Authorization
    signature: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization.

        Returns:
            Dict with authorization and signature fields.
        """
        result: dict[str, Any] = {
            "authorization": {
                "from": self.authorization.from_address,
                "to": self.authorization.to,
                "value": self.authorization.value,
                "validAfter": self.authorization.valid_after,
                "validBefore": self.authorization.valid_before,
                "nonce": self.authorization.nonce,
            }
        }
        if self.signature:
            result["signature"] = self.signature
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ExactEIP3009Payload":
        """Create from dictionary.

        Args:
            data: Dict with authorization and optional signature.

        Returns:
            ExactEIP3009Payload instance.
        """
        auth = data.get("authorization", {})
        return cls(
            authorization=ExactEIP3009Authorization(
                from_address=auth.get("from", ""),
                to=auth.get("to", ""),
                value=auth.get("value", ""),
                valid_after=auth.get("validAfter", ""),
                valid_before=auth.get("validBefore", ""),
                nonce=auth.get("nonce", ""),
            ),
            signature=data.get("signature"),
        )


# Type aliases for V1/V2 compatibility
ExactEvmPayloadV1 = ExactEIP3009Payload
ExactEvmPayloadV2 = ExactEIP3009Payload


@dataclass
class ExactPermit2Witness:
    """Witness data for Permit2 PermitWitnessTransferFrom."""

    to: str  # Recipient address
    valid_after: str  # Unix timestamp as string (lower time bound)


@dataclass
class ExactPermit2TokenPermissions:
    """Token permissions for Permit2."""

    token: str  # ERC-20 token address
    amount: str  # Amount in smallest unit as string


@dataclass
class ExactPermit2Authorization:
    """Permit2 PermitWitnessTransferFrom data."""

    from_address: str  # 'from' field (payer address)
    permitted: ExactPermit2TokenPermissions
    spender: str  # x402ExactPermit2Proxy address
    nonce: str  # Random uint256 as decimal string
    deadline: str  # Unix timestamp as string (upper time bound)
    witness: ExactPermit2Witness


@dataclass
class ExactPermit2Payload:
    """Exact payment payload for Permit2 flow."""

    permit2_authorization: ExactPermit2Authorization
    signature: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization.

        Returns:
            Dict with permit2Authorization and signature fields.
        """
        result: dict[str, Any] = {
            "permit2Authorization": {
                "from": self.permit2_authorization.from_address,
                "permitted": {
                    "token": self.permit2_authorization.permitted.token,
                    "amount": self.permit2_authorization.permitted.amount,
                },
                "spender": self.permit2_authorization.spender,
                "nonce": self.permit2_authorization.nonce,
                "deadline": self.permit2_authorization.deadline,
                "witness": {
                    "to": self.permit2_authorization.witness.to,
                    "validAfter": self.permit2_authorization.witness.valid_after,
                },
            }
        }
        if self.signature:
            result["signature"] = self.signature
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ExactPermit2Payload":
        """Create from dictionary.

        Args:
            data: Dict with permit2Authorization and optional signature.

        Returns:
            ExactPermit2Payload instance.
        """
        auth = data.get("permit2Authorization", {})
        permitted = auth.get("permitted", {})
        witness = auth.get("witness", {})
        return cls(
            permit2_authorization=ExactPermit2Authorization(
                from_address=auth.get("from", ""),
                permitted=ExactPermit2TokenPermissions(
                    token=permitted.get("token", ""),
                    amount=permitted.get("amount", ""),
                ),
                spender=auth.get("spender", ""),
                nonce=auth.get("nonce", ""),
                deadline=auth.get("deadline", ""),
                witness=ExactPermit2Witness(
                    to=witness.get("to", ""),
                    valid_after=witness.get("validAfter", ""),
                ),
            ),
            signature=data.get("signature"),
        )


def is_permit2_payload(payload: dict[str, Any]) -> bool:
    """Check if a raw payload dict is a Permit2 payload.

    Args:
        payload: Raw payload dictionary.

    Returns:
        True if the payload contains permit2Authorization key.
    """
    return "permit2Authorization" in payload


@dataclass
class UptoPermit2Witness:
    """Witness data for upto Permit2 PermitWitnessTransferFrom.

    Includes facilitator field for access control (vs exact which has only to + validAfter).
    """

    to: str
    facilitator: str
    valid_after: str


@dataclass
class UptoPermit2Authorization:
    """Upto Permit2 PermitWitnessTransferFrom data."""

    from_address: str
    permitted: ExactPermit2TokenPermissions
    spender: str
    nonce: str
    deadline: str
    witness: UptoPermit2Witness


@dataclass
class UptoPermit2Payload:
    """Upto payment payload for Permit2 flow."""

    permit2_authorization: UptoPermit2Authorization
    signature: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "permit2Authorization": {
                "from": self.permit2_authorization.from_address,
                "permitted": {
                    "token": self.permit2_authorization.permitted.token,
                    "amount": self.permit2_authorization.permitted.amount,
                },
                "spender": self.permit2_authorization.spender,
                "nonce": self.permit2_authorization.nonce,
                "deadline": self.permit2_authorization.deadline,
                "witness": {
                    "to": self.permit2_authorization.witness.to,
                    "facilitator": self.permit2_authorization.witness.facilitator,
                    "validAfter": self.permit2_authorization.witness.valid_after,
                },
            }
        }
        if self.signature:
            result["signature"] = self.signature
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "UptoPermit2Payload":
        auth = data.get("permit2Authorization", {})
        permitted = auth.get("permitted", {})
        witness = auth.get("witness", {})
        return cls(
            permit2_authorization=UptoPermit2Authorization(
                from_address=auth.get("from", ""),
                permitted=ExactPermit2TokenPermissions(
                    token=permitted.get("token", ""),
                    amount=permitted.get("amount", ""),
                ),
                spender=auth.get("spender", ""),
                nonce=auth.get("nonce", ""),
                deadline=auth.get("deadline", ""),
                witness=UptoPermit2Witness(
                    to=witness.get("to", ""),
                    facilitator=witness.get("facilitator", ""),
                    valid_after=witness.get("validAfter", ""),
                ),
            ),
            signature=data.get("signature"),
        )


def is_upto_permit2_payload(payload: Any) -> bool:
    """Check for an exclusively complete upto Permit2 payload."""
    if not isinstance(payload, dict):
        return False
    if not isinstance(payload.get("signature"), str):
        return False
    if "authorization" in payload or "paymentInfo" in payload:
        return False
    auth = payload.get("permit2Authorization")
    if not isinstance(auth, dict):
        return False
    if not all(isinstance(auth.get(key), str) for key in ("from", "spender", "nonce", "deadline")):
        return False
    permitted = auth.get("permitted")
    if not isinstance(permitted, dict):
        return False
    if not all(isinstance(permitted.get(key), str) for key in ("token", "amount")):
        return False
    witness = auth.get("witness")
    if not isinstance(witness, dict):
        return False
    return all(isinstance(witness.get(key), str) for key in ("to", "facilitator", "validAfter"))


@dataclass
class UptoEIP3009Authorization:
    """ERC-3009 ReceiveWithAuthorization data for an upto payment."""

    from_address: str
    to: str
    value: str
    valid_after: str
    valid_before: str
    nonce: str


@dataclass
class UptoEIP3009PaymentInfo:
    """Settlement commitment opened by the upto ERC-3009 proxy."""

    pay_to: str
    settler: str
    salt: str


@dataclass
class UptoEIP3009Payload:
    """Upto ERC-3009 payload signed with ReceiveWithAuthorization."""

    signature: str
    authorization: UptoEIP3009Authorization
    payment_info: UptoEIP3009PaymentInfo

    def to_dict(self) -> dict[str, Any]:
        """Serialize using the x402 wire field names."""
        return {
            "signature": self.signature,
            "authorization": {
                "from": self.authorization.from_address,
                "to": self.authorization.to,
                "value": self.authorization.value,
                "validAfter": self.authorization.valid_after,
                "validBefore": self.authorization.valid_before,
                "nonce": self.authorization.nonce,
            },
            "paymentInfo": {
                "payTo": self.payment_info.pay_to,
                "settler": self.payment_info.settler,
                "salt": self.payment_info.salt,
            },
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "UptoEIP3009Payload":
        """Parse a complete, unmixed upto ERC-3009 payload."""
        if not is_upto_eip3009_payload(data):
            raise ValueError("invalid upto EIP-3009 payload")
        authorization = data["authorization"]
        payment_info = data["paymentInfo"]
        return cls(
            signature=data["signature"],
            authorization=UptoEIP3009Authorization(
                from_address=authorization["from"],
                to=authorization["to"],
                value=authorization["value"],
                valid_after=authorization["validAfter"],
                valid_before=authorization["validBefore"],
                nonce=authorization["nonce"],
            ),
            payment_info=UptoEIP3009PaymentInfo(
                pay_to=payment_info["payTo"],
                settler=payment_info["settler"],
                salt=payment_info["salt"],
            ),
        )


def is_upto_eip3009_payload(payload: Any) -> bool:
    """Check for an exclusively complete upto ERC-3009 payload."""
    if not isinstance(payload, dict):
        return False
    if not isinstance(payload.get("signature"), str):
        return False
    if "permit2Authorization" in payload:
        return False
    authorization = payload.get("authorization")
    if not isinstance(authorization, dict):
        return False
    if not all(
        isinstance(authorization.get(key), str)
        for key in ("from", "to", "value", "validAfter", "validBefore", "nonce")
    ):
        return False
    payment_info = payload.get("paymentInfo")
    if not isinstance(payment_info, dict):
        return False
    return all(isinstance(payment_info.get(key), str) for key in ("payTo", "settler", "salt"))


def is_eip3009_payload(payload: dict[str, Any]) -> bool:
    """Check if a raw payload dict is an EIP-3009 payload.

    Args:
        payload: Raw payload dictionary.

    Returns:
        True if the payload contains authorization key.
    """
    return "authorization" in payload


@dataclass
class TypedDataDomain:
    """EIP-712 domain separator."""

    name: str
    version: str
    chain_id: int
    verifying_contract: str


@dataclass
class TypedDataField:
    """Field definition for EIP-712 types."""

    name: str
    type: str


@dataclass
class TransactionReceipt:
    """Transaction receipt from blockchain."""

    status: int
    block_number: int
    tx_hash: str
    logs: list[Any] | None = None


@dataclass
class ERC6492SignatureData:
    """Parsed ERC-6492 signature components."""

    factory: bytes  # 20-byte factory address (zero if not ERC-6492)
    factory_calldata: bytes  # Deployment calldata (empty if not ERC-6492)
    inner_signature: bytes  # The actual signature (EIP-1271 or EOA)
    # Whether the signer had bytecode, as determined by verify_universal_signature.
    # Zero value elsewhere.
    code_deployed: bool = False


# EIP-712 authorization types for signing
AUTHORIZATION_TYPES: dict[str, list[dict[str, str]]] = {
    "TransferWithAuthorization": [
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
        {"name": "nonce", "type": "bytes32"},
    ]
}

RECEIVE_AUTHORIZATION_TYPES: dict[str, list[dict[str, str]]] = {
    "ReceiveWithAuthorization": [
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
        {"name": "nonce", "type": "bytes32"},
    ]
}

# EIP-712 domain types
DOMAIN_TYPES: dict[str, list[dict[str, str]]] = {
    "EIP712Domain": [
        {"name": "name", "type": "string"},
        {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ]
}
