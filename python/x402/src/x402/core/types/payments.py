from typing import Any, Optional

from pydantic import Field, field_validator

from x402.core.types import BaseCompoundType, Network, Version

Payload = dict[str, Any]


class Extension(BaseCompoundType):
    info: dict[str, Any]
    schema_: dict[str, Any] = Field(alias="schema")


class ResourceInfo(BaseCompoundType):
    url: str
    description: str
    mime_type: str


class PaymentRequirements(BaseCompoundType):
    scheme: str
    network: Network
    asset: str
    amount: str
    pay_to: str
    max_timeout_seconds: int
    schema_: Optional[dict[str, Any]] = Field(default=None, alias="schema")
    extra: Optional[dict[str, Any]] = None

    @field_validator("amount")
    def validate_amount(cls, v):
        try:
            int(v)
        except ValueError:
            raise ValueError("amount must be an integer encoded as a string")
        return v


class PaymentRequired(BaseCompoundType):
    x402_version: Version
    error: Optional[str] = None
    resource: ResourceInfo
    accepts: list[PaymentRequirements]
    extensions: Optional[dict[str, Extension]] = None


class PaymentPayloadV1(BaseCompoundType):
    x402_version: Version
    scheme: str
    network: Network
    payload: Payload


class PaymentPayload(BaseCompoundType):
    x402_version: Version
    resource: ResourceInfo
    accepted: PaymentRequirements
    payload: Payload
    extensions: Optional[dict[str, Extension]] = None
