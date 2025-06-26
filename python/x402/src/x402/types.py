from __future__ import annotations

from typing import Any, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from x402.networks import SupportedNetworks


class TokenAmount(BaseModel):
    """Represents an amount of tokens in atomic units with asset information"""

    amount: str
    asset: TokenAsset

    @field_validator("amount")
    def validate_amount(cls, v):
        try:
            int(v)
        except ValueError:
            raise ValueError("amount must be an integer encoded as a string")
        return v


class TokenAsset(BaseModel):
    """Represents token asset information including EIP-712 domain data"""

    address: str
    decimals: int
    eip712: EIP712Domain

    @field_validator("decimals")
    def validate_decimals(cls, v):
        if v < 0 or v > 255:
            raise ValueError("decimals must be between 0 and 255")
        return v


class EIP712Domain(BaseModel):
    """EIP-712 domain information for token signing"""

    name: str
    version: str


# Price can be either Money (USD string) or TokenAmount
Money = Union[str, int]  # e.g., "$0.01", 0.01, "0.001"
Price = Union[Money, TokenAmount]


class PaymentRequirements(BaseModel):
    scheme: str
    network: SupportedNetworks
    max_amount_required: str
    resource: str
    description: str
    mime_type: str
    output_schema: Optional[Any] = None
    pay_to: str
    max_timeout_seconds: int
    asset: str
    extra: Optional[dict[str, Any]] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )

    @field_validator("max_amount_required")
    def validate_max_amount_required(cls, v):
        try:
            int(v)
        except ValueError:
            raise ValueError(
                "max_amount_required must be an integer encoded as a string"
            )
        return v


# Returned by a server as json alongside a 402 response code
class x402PaymentRequiredResponse(BaseModel):
    x402_version: int
    accepts: list[PaymentRequirements]
    error: str

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )


class ExactPaymentPayload(BaseModel):
    signature: str
    authorization: EIP3009Authorization


class EIP3009Authorization(BaseModel):
    from_: str = Field(alias="from")
    to: str
    value: str
    valid_after: str
    valid_before: str
    nonce: str

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )

    @field_validator("value")
    def validate_value(cls, v):
        try:
            int(v)
        except ValueError:
            raise ValueError("value must be an integer encoded as a string")
        return v


class VerifyResponse(BaseModel):
    is_valid: bool = Field(alias="isValid")
    invalid_reason: Optional[str] = Field(None, alias="invalidReason")
    payer: Optional[str]

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )


class SettleResponse(BaseModel):
    success: bool
    error_reason: Optional[str] = None
    transaction: Optional[str] = None
    network: Optional[str] = None
    payer: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )


# Union of payloads for each scheme
SchemePayloads = ExactPaymentPayload


class PaymentPayload(BaseModel):
    x402_version: int
    scheme: str
    network: str
    payload: SchemePayloads

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        from_attributes=True,
    )


class X402Headers(BaseModel):
    x_payment: str


class UnsupportedSchemeException(Exception):
    pass
