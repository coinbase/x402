from typing import Any, Protocol, runtime_checkable

from x402.core.types import Version
from x402.core.types.payments import PaymentRequirements


@runtime_checkable
class SchemeNetworkClient(Protocol):
    scheme: str

    async def create_payment_payload(
        self, x402_version: Version, payment_requirements: PaymentRequirements
    ) -> dict[str, Any]:
        pass
