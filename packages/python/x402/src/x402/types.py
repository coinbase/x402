from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional, Any


class PaymentDetails(BaseModel):
    scheme: str
    network_id: str = Field(alias="networkId")
    max_amount_required: str = Field(alias="maxAmountRequired")
    resource: str
    description: str
    mime_type: str = Field(alias="mimeType")
    output_schema: Optional[Any] = Field(alias="outputSchema")
    pay_to_address: str = Field(alias="payToAddress")
    required_deadline_seconds: int = Field(alias="requiredDeadlineSeconds")
    usdc_address: str = Field(alias="usdcAddress")
    extra: Optional[dict[str, Any]]

    class Config:
        populate_by_name = False
        serialize_by_alias = True


# TODO: migrate this to new format described in readme
class PaymentRequiredResponse(BaseModel):
    paymentDetails: PaymentDetails
    error: str

    class Config:
        populate_by_name = False
        serialize_by_alias = True


class ExactPaymentPayload(BaseModel):
    signer: str
    authorization: EIP3009Authorization


class EIP3009Authorization(BaseModel):
    from_: str = Field(alias="from")
    to: str
    value: int
    validAfter: int
    validBefore: int
    nonce: str
    version: str

    class Config:
        populate_by_name = False
        serialize_by_alias = True


class VerifyResponse(BaseModel):
    is_valid: bool = Field(alias="isValid")
    invalid_reason: Optional[str] = Field(None, alias="invalidReason")

    class Config:
        populate_by_name = True
        serialize_by_alias = True


class SettleResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    tx_hash: Optional[str] = Field(None, alias="txHash")
    network_id: Optional[str] = Field(None, alias="networkId")

    class Config:
        populate_by_name = True
        serialize_by_alias = True


# Union of payloads for each scheme
SchemePayloads = ExactPaymentPayload


class PaymentPayload(BaseModel):
    x402Version: int
    scheme: str
    networkId: str
    payload: SchemePayloads
    resource: str


class X402Headers(BaseModel):
    x_payment: str
