from typing import Any, Dict

from fastapi import APIRouter, Request, Response
from x402.types import ResourceInfo

from common import (
    create_exact_payment_requirements,
    settle_response_header,
    verify_payment,
    facilitator,
)

router = APIRouter()


@router.get("/dynamic-price")
async def dynamic_price(request: Request, response: Response) -> Dict[str, Any]:
    """
    Shows how to implement variable pricing based on request parameters.
    """
    multiplier = int(request.query_params.get("multiplier", "1"))
    base_price = 0.003
    dynamic_price_value = base_price * multiplier

    resource_url = str(request.url)
    resource_info = ResourceInfo(
        url=resource_url,
        description=f"Access to weather data (x{multiplier})",
        mime_type="application/json",
    )

    payment_requirements = [
        create_exact_payment_requirements(
            price=f"${dynamic_price_value:.4f}",
            network="eip155:84532",
        )
    ]

    await verify_payment(request, payment_requirements, resource_info)

    # Process payment synchronously
    payment = request.state.payment
    requirement = request.state.selected_requirement

    settle_response = await facilitator.settle(payment, requirement)
    response_header = settle_response_header(settle_response)

    # Set the payment response header (V2: PAYMENT-RESPONSE)
    response.headers["PAYMENT-RESPONSE"] = response_header

    return {
        "report": {
            "success": "sunny",
            "temperature": 70,
            "price_paid": dynamic_price_value,
        }
    }
