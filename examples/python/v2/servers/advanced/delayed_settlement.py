import asyncio
import logging
from typing import Any, Dict

from fastapi import APIRouter, Request
from x402.types import ResourceInfo

from common import (
    create_exact_payment_requirements,
    settle_response_header,
    verify_payment,
    facilitator,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/delayed-settlement")
async def delayed_settlement(request: Request) -> Dict[str, Any]:
    """
    Demonstrates asynchronous payment processing.
    """
    resource_url = str(request.url)

    # V2: Define Resource Info explicitly
    resource_info = ResourceInfo(
        url=resource_url,
        description="Access to weather data (async)",
        mime_type="application/json",
    )

    payment_requirements = [
        create_exact_payment_requirements(
            price="$0.001",
            network="eip155:84532",  # Base Sepolia
        )
    ]

    await verify_payment(request, payment_requirements, resource_info)

    # Return weather data immediately
    response_data = {
        "report": {
            "weather": "sunny",
            "temperature": 70,
        }
    }

    # Process payment asynchronously in the background
    payment = request.state.payment
    requirement = request.state.selected_requirement

    async def process_payment_async():
        try:
            settle_response = await facilitator.settle(payment, requirement)
            response_header = settle_response_header(settle_response)
            logger.info(f"Payment settled: {response_header}")
        except Exception as e:
            logger.error(f"Payment settlement failed: {e}")

    # Start background task
    asyncio.create_task(process_payment_async())

    return response_data
