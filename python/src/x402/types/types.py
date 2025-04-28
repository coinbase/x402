from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

class PaymentRequirements(BaseModel):
    """PaymentRequirements is a model for the payment requirements"""
    scheme: str = "exact"
    network: str
    max_amount_required: str
    resource: str
    description: str
    mime_type: str
    pay_to: str
    max_timeout_seconds: int
    asset: str
    output_schema: Optional[Dict[str, Any]] = {}
    extra: Optional[Dict[str, Any]] = {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert the PaymentRequirements object to a dictionary"""
        return {
            "scheme": self.scheme,
            "network": self.network,
            "maxAmountRequired": self.max_amount_required,
            "resource": self.resource,
            "description": self.description,
            "mimeType": self.mime_type,
            "payTo": self.pay_to,
            "maxTimeoutSeconds": self.max_timeout_seconds,
            "asset": self.asset,
            "output_schema": self.output_schema,
            "extra": self.extra
        }

    def set_usdc_info(self, is_testnet: bool) -> None:
        """
        Set the USDC information in the extra field based on the network type

        Parameters
        ----------
        is_testnet: bool
            Indicates whether the network is a testnet or mainnet
        """
        usdc_info = {
            "name": "USDC" if is_testnet else "USD Coin",
            "version": "2"
        }
        self.extra = usdc_info



class ExactEvmPayloadAuthorization(BaseModel):
    """
    ExactEvmPayloadAuthorization represents the payload for an exact EVM payment ERC-3009
    authorization EIP-712 typed data message
    """
    from_address: str = Field(..., alias="from")
    to: str
    value: str
    validAfter: str
    ValidBefore: str
    nonce: str

    def to_dict(self) -> Dict[str, Any]:
        """Convert the ExactEvmPayloadAuthorization object to a dictionary"""
        return {
            "from": self.from_address,
            "to": self.to,
            "value": self.value,
            "validAfter": self.validAfter,
            "ValidBefore": self.ValidBefore,
            "nonce": self.nonce
        }


class ExactEvmPayload(BaseModel):
    """ExactEvmPayload is a model for the exact EVM payload"""
    signature: str
    authorization: ExactEvmPayloadAuthorization

    def to_dict(self) -> Dict[str, Any]:
        """Convert the ExactEvmPayload object to a dictionary"""
        return {
            "signature": self.signature,
            "authorization": self.authorization.to_dict()
        }


class PaymentPayload(BaseModel):
    """PaymentPayload is a model for the payment payload"""
    x402Version: int
    scheme: str = "exact"
    network: str
    payload: ExactEvmPayload

    def to_dict(self) -> Dict[str, Any]:
        """Convert the PaymentPayload object to a dictionary"""
        return {
            "x402Version": self.x402Version,
            "scheme": self.scheme,
            "network": self.network,
            "payload": self.payload.to_dict()
        }
