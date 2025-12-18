from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from typing_extensions import (
    TypedDict,
)  # use `typing_extensions.TypedDict` instead of `typing.TypedDict` on Python < 3.12

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
    amount: str
    pay_to: str
    max_timeout_seconds: int
    asset: str
    extra: Optional[dict[str, Any]] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )

    @field_validator("amount")
    def validate_amount(cls, v):
        try:
            int(v)
        except ValueError:
            raise ValueError("amount must be an integer encoded as a string")
        return v


class ResourceInfo(BaseModel):
    url: str
    description: str
    mime_type: str

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# Returned by a server as json alongside a 402 response code
class x402PaymentRequiredResponse(BaseModel):
    x402_version: int
    accepts: list[PaymentRequirements]
    error: str
    resource: Optional[ResourceInfo] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
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
    payer: Optional[str] = None
    error: Optional[str] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
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
        from_attributes=True,
    )


# Union of payloads for each scheme
SchemePayloads = ExactPaymentPayload


class PaymentPayload(BaseModel):
    x402_version: int
    resource: Optional[ResourceInfo] = None
    accepted: Optional[PaymentRequirements] = None
    payload: SchemePayloads
    extensions: Optional[dict[str, Any]] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class X402Headers(BaseModel):
    payment_signature: Optional[str] = Field(None, alias="payment-signature")
    payment_response: Optional[str] = Field(None, alias="payment-response")
    payment_required: Optional[str] = Field(None, alias="payment-required")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class UnsupportedSchemeException(Exception):
    pass


class PaywallConfig(TypedDict, total=False):
    """Configuration for paywall UI customization"""

    app_name: str
    app_logo: str


class DiscoveredResource(BaseModel):
    """A discovery resource represents a discoverable resource in the X402 ecosystem."""

    resource: str
    type: str = Field(..., pattern="^http$")  # Currently only supports 'http'
    x402_version: int = Field(..., alias="x402Version")
    accepts: List["PaymentRequirements"]
    last_updated: datetime = Field(
        ...,
        alias="lastUpdated",
        description="ISO 8601 formatted datetime string with UTC timezone (e.g. 2025-08-09T01:07:04.005Z)",
    )
    metadata: Optional[dict] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ListDiscoveryResourcesRequest(BaseModel):
    """Request parameters for listing discovery resources."""

    type: Optional[str] = None
    limit: Optional[int] = None
    offset: Optional[int] = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class DiscoveryResourcesPagination(BaseModel):
    """Pagination information for discovery resources responses."""

    limit: int
    offset: int
    total: int

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ListDiscoveryResourcesResponse(BaseModel):
    """Response from the discovery resources endpoint."""

    x402_version: int = Field(..., alias="x402Version")
    items: List[DiscoveredResource]
    pagination: DiscoveryResourcesPagination

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )
