from typing import Any, Dict

from fastapi import APIRouter, Request, Response
from x402.types import EIP712Domain, ResourceInfo, TokenAmount, TokenAsset

from common import (
    create_exact_payment_requirements,
    settle_response_header,
    verify_payment,
    facilitator,
)

router = APIRouter()


@router.get("/multiple-payment-requirements")
async def multiple_payment_requirements(
    request: Request, response: Response
) -> Dict[str, Any]:
    """
    Illustrates how to accept multiple payment options.
    """
    resource_url = str(request.url)
    resource_info = ResourceInfo(
        url=resource_url,
        description="Access to weather data (Multiple Options)",
        mime_type="application/json",
    )

    payment_requirements = [
        # Option 1: USD price (Base Sepolia)
        create_exact_payment_requirements(
            price="$0.001",
            network="eip155:84532",
        ),
        # Option 2: Specific token amount (USDC)
        create_exact_payment_requirements(
            price=TokenAmount(
                amount="100000",
                asset=TokenAsset(
                    address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                    decimals=6,
                    eip712=EIP712Domain(name="USDC", version="2"),
                ),
            ),
            network="eip155:84532",
        ),
    ]

    await verify_payment(request, payment_requirements, resource_info)

    # Process payment synchronously
    payment = request.state.payment
    requirement = request.state.selected_requirement

    settle_response = await facilitator.settle(payment, requirement)
    response_header = settle_response_header(settle_response)

    # Set the payment response header
    response.headers["PAYMENT-RESPONSE"] = response_header

    return {
        "report": {
            "success": "sunny",
            "temperature": 70,
        }
    }
