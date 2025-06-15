import httpx
from x402.types import (
    PaymentPayload,
    PaymentRequirements,
    VerifyResponse,
    SettleResponse,
)


class FacilitatorClient:
    def __init__(self, url: str):
        if url.startswith("http://") or url.startswith("https://"):
            if url.endswith("/"):
                self.url = url[:-1]
            else:
                self.url = url
        else:
            raise ValueError(f"Invalid URL {url}, must start with http:// or https://")

    async def verify(
        self, payment: PaymentPayload, payment_requirements: PaymentRequirements
    ) -> VerifyResponse:
        """Verify a payment header is valid and a request should be processed"""

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.url}/verify",
                json={
                    "paymentPayload": payment.model_dump(),
                    "paymentRequirements": payment_requirements.model_dump(),
                },
                follow_redirects=True,
            )

            data = response.json()
            return VerifyResponse(**data)

    async def settle(
        self, payment: PaymentPayload, payment_requirements: PaymentRequirements
    ) -> SettleResponse:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.url}/settle",
                json={
                    "paymentPayload": payment.model_dump(),
                    "paymentRequirements": payment_requirements.model_dump(),
                },
                follow_redirects=True,
            )
            data = response.json()
            return SettleResponse(**data)
