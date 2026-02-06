"""MCP Server with x402 Paid Tools - Simple Example.

This example demonstrates creating an MCP server with payment-wrapped tools
using the REAL MCP SDK (mcp package from PyPI).
Uses the create_payment_wrapper function to add x402 payment to individual tools.

Run with: python main.py simple
"""

import json
import os
import random
import sys
from typing import Any

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from x402.http import FacilitatorConfig, HTTPFacilitatorClient
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.mcp import (
    MCPContentItem,
    MCPToolContext,
    MCPToolResult,
    PaymentWrapperConfig,
    ResourceInfo,
    create_payment_wrapper,
)
from x402.schemas import ResourceConfig
from x402.server import x402ResourceServerSync

load_dotenv()

EVM_ADDRESS = os.getenv("EVM_ADDRESS")
FACILITATOR_URL = os.getenv("FACILITATOR_URL", "https://x402.org/facilitator")
PORT = int(os.getenv("PORT", "4022"))

if not EVM_ADDRESS:
    print("❌ EVM_ADDRESS environment variable is required")
    sys.exit(1)

if not FACILITATOR_URL:
    print("❌ FACILITATOR_URL environment variable is required")
    sys.exit(1)


def get_weather_data(city: str) -> dict[str, Any]:
    """Simulate fetching weather data for a city."""
    conditions = ["sunny", "cloudy", "rainy", "snowy", "windy"]
    weather = random.choice(conditions)
    temperature = random.randint(40, 80)
    return {"city": city, "weather": weather, "temperature": temperature}


def run_simple() -> None:
    """Main entry point - demonstrates the payment wrapper API with REAL MCP SDK."""
    print("\n📦 Using Payment Wrapper API with REAL MCP SDK\n")

    # ========================================================================
    # STEP 1: Create REAL MCP server using FastMCP
    # ========================================================================
    mcp_server = FastMCP("x402-mcp-server", json_response=True)

    # ========================================================================
    # STEP 2: Set up x402 resource server for payment handling
    # ========================================================================
    facilitator_client = HTTPFacilitatorClient(FacilitatorConfig(url=FACILITATOR_URL))
    resource_server = x402ResourceServerSync(facilitator_client)
    resource_server.register("eip155:84532", ExactEvmServerScheme())
    resource_server.initialize()

    # ========================================================================
    # STEP 3: Build payment requirements
    # ========================================================================
    config = ResourceConfig(
        scheme="exact",
        network="eip155:84532",
        pay_to=EVM_ADDRESS,
        price="$0.001",
        extra={"name": "USDC", "version": "2"},
    )

    accepts = resource_server.build_payment_requirements(config)

    # ========================================================================
    # STEP 4: Create payment wrapper with accepts array
    # ========================================================================
    paid_weather = create_payment_wrapper(
        resource_server,
        PaymentWrapperConfig(
            accepts=accepts,
            resource=ResourceInfo(
                url="mcp://tool/get_weather",
                description="Get weather for a city",
                mime_type="application/json",
            ),
        ),
    )

    # ========================================================================
    # STEP 5: Register tools using REAL MCP SDK with payment wrapper
    # ========================================================================

    # Free tool - register directly
    @mcp_server.tool()
    def ping() -> str:
        """A free health check tool."""
        return "pong"

    # Paid tool - wrap handler with payment
    @mcp_server.tool()
    def get_weather(city: str) -> str:
        """Get current weather for a city. Requires payment of $0.001."""
        # Build tool context
        tool_context = MCPToolContext(
            tool_name="get_weather",
            arguments={"city": city},
            meta={},
        )

        # Call paid handler
        result = paid_weather(
            lambda args, tc: MCPToolResult(
                content=[{"type": "text", "text": json.dumps(get_weather_data(city))}],
                is_error=False,
            )
        )({"city": city}, {"_meta": {}, "toolName": "get_weather"})

        if result.is_error:
            # Extract payment required from result
            if result.content and len(result.content) > 0:
                return result.content[0].get("text", "Payment required")
            return "Payment required"

        return result.content[0].get("text", "Weather data") if result.content else "No data"

    # Run server with streamable HTTP transport
    print(f"🚀 x402 MCP Server running on http://localhost:{PORT}")
    print("\n📋 Available tools:")
    print("   - get_weather (paid: $0.001)")
    print("   - ping (free)")
    print(f"\n🔗 Connect via Streamable HTTP: http://localhost:{PORT}/mcp")
    print("\n💡 This example uses create_payment_wrapper() with REAL MCP SDK.\n")

    mcp_server.run(transport="streamable-http", port=PORT)
