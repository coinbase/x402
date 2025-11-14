from typing import Any, Optional

from pydantic import field_validator

from x402.core.types import BaseCompoundType, Network, Version


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
    extra: dict[str, Any]

    @field_validator("amount")
    def validate_amount(cls, v):
        try:
            int(v)
        except ValueError:
            raise ValueError("amount must be an integer encoded as a string")
        return v


class PaymentPayload(BaseCompoundType):
    x402_version: Version
    resource: ResourceInfo
    accepted: PaymentRequirements
    payload: dict[str, Any]
    extensions: Optional[dict[str, Any]] = None
