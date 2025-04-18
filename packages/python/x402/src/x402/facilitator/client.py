import httpx
from x402.types import PaymentDetails, VerifyResponse, SettleResponse


class FacilitatorClient:
    def __init__(self, url: str):
        self.url = url

    async def verify(
        self, payment: str, payment_details: PaymentDetails
    ) -> VerifyResponse:
        """Verify a payment header is valid and a request should be processed"""

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.url}/verify",
                json={
                    "payload": payment,
                    "details": payment_details.model_dump(),
                },
                follow_redirects=True,
            )

            data = response.json()
            return VerifyResponse(**data)

    async def settle(
        self, payment: str, payment_details: PaymentDetails
    ) -> SettleResponse:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.url}/settle",
                json={
                    "payload": payment,
                    "details": payment_details.model_dump(),
                },
                follow_redirects=True,
            )
            return SettleResponse(**response.json())
