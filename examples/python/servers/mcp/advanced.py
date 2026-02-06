"""MCP Server with x402 Paid Tools - Advanced Example with Hooks.

This example demonstrates using create_payment_wrapper with hooks for:
- Logging and observability
- Rate limiting and access control
- Custom settlement handling
- Production monitoring

Run with: python main.py advanced
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
    AfterExecutionContext,
    MCPContentItem,
    MCPToolContext,
    MCPToolResult,
    PaymentWrapperConfig,
    PaymentWrapperHooks,
    ResourceInfo,
    ServerHookContext,
    SettlementContext,
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



def get_weather_data(city: str) -> dict[str, Any]:
    """Simulate fetching weather data for a city."""
    conditions = ["sunny", "cloudy", "rainy", "snowy", "windy"]
    weather = random.choice(conditions)
    temperature = random.randint(40, 80)
    return {"city": city, "weather": weather, "temperature": temperature}


def run_advanced() -> None:
    """Main entry point - demonstrates hooks with payment wrapper using REAL MCP SDK."""
    print("\n📦 Using Payment Wrapper with Hooks and REAL MCP SDK\n")

    # ========================================================================
    # STEP 1: Create REAL MCP server using FastMCP
    # ========================================================================
    mcp_server = FastMCP("x402-mcp-server-advanced", json_response=True)

    facilitator_client = HTTPFacilitatorClient(FacilitatorConfig(url=FACILITATOR_URL))
    resource_server = x402ResourceServerSync(facilitator_client)
    resource_server.register("eip155:84532", ExactEvmServerScheme())
    resource_server.initialize()

    # Build payment requirements
    weather_config = ResourceConfig(
        scheme="exact",
        network="eip155:84532",
        pay_to=EVM_ADDRESS,
        price="$0.001",
        extra={"name": "USDC", "version": "2"},
    )
    weather_accepts = resource_server.build_payment_requirements(weather_config)

    forecast_config = ResourceConfig(
        scheme="exact",
        network="eip155:84532",
        pay_to=EVM_ADDRESS,
        price="$0.005",
        extra={"name": "USDC", "version": "2"},
    )
    forecast_accepts = resource_server.build_payment_requirements(forecast_config)

    # Shared hooks
    def before_hook(context: ServerHookContext) -> tuple[bool, None]:
        print(f"\n🔧 [Hook] Before execution: {context.tool_name}")
        if context.payment_payload.payload:
            auth = context.payment_payload.payload.get("authorization", {})
            if isinstance(auth, dict):
                from_addr = auth.get("from")
                if from_addr:
                    print(f"   Payment from: {from_addr}")
        print(f"   Amount: {context.payment_requirements.amount}")
        return True, None

    def after_hook(context: AfterExecutionContext) -> None:
        print(f"✅ [Hook] After execution: {context.tool_name}")
        print(f"   Result error: {context.result.is_error}")

    def settlement_hook(context: SettlementContext) -> None:
        print(f"💸 [Hook] Settlement complete: {context.tool_name}")
        if context.settlement.transaction:
            print(f"   Transaction: {context.settlement.transaction}")
        print(f"   Success: {context.settlement.success}\n")

    shared_hooks = PaymentWrapperHooks(
        on_before_execution=before_hook,
        on_after_execution=after_hook,
        on_after_settlement=settlement_hook,
    )

    paid_weather = create_payment_wrapper(
        resource_server,
        PaymentWrapperConfig(
            accepts=weather_accepts,
            resource=ResourceInfo(
                url="mcp://tool/get_weather",
                description="Get weather for a city",
                mime_type="application/json",
            ),
            hooks=shared_hooks,
        ),
    )

    paid_forecast = create_payment_wrapper(
        resource_server,
        PaymentWrapperConfig(
            accepts=forecast_accepts,
            resource=ResourceInfo(
                url="mcp://tool/get_forecast",
                description="Get 7-day forecast",
                mime_type="application/json",
            ),
            hooks=shared_hooks,
        ),
    )

    # ========================================================================
    # STEP 5: Register tools using REAL MCP SDK with hooks
    # ========================================================================

    # Free tool
    @mcp_server.tool()
    def ping() -> str:
        """A free health check tool."""
        return "pong"

    # Weather tool with hooks
    @mcp_server.tool()
    def get_weather(city: str = "San Francisco") -> str:
        """Get current weather for a city. Requires payment of $0.001."""
        # Call paid handler with payment wrapper
        result = paid_weather(
            lambda args, tc: MCPToolResult(
                content=[MCPContentItem(type="text", text=json.dumps(get_weather_data(city), indent=2))],
                is_error=False,
            )
        )({"city": city}, {"_meta": {}, "toolName": "get_weather"})

        if result.is_error:
            if result.content and len(result.content) > 0:
                return result.content[0].text if isinstance(result.content[0], MCPContentItem) else result.content[0].get("text", "Payment required")
            return "Payment required"

        return result.content[0].text if result.content and isinstance(result.content[0], MCPContentItem) else (result.content[0].get("text", "Weather data") if result.content else "No data")

    # Forecast tool with hooks
    @mcp_server.tool()
    def get_forecast(city: str = "San Francisco") -> str:
        """Get 7-day weather forecast. Requires payment of $0.005."""
        forecast = [
            {**get_weather_data(city), "day": i + 1} for i in range(7)
        ]

        # Call paid handler with payment wrapper
        result = paid_forecast(
            lambda args, tc: MCPToolResult(
                content=[MCPContentItem(type="text", text=json.dumps(forecast, indent=2))],
                is_error=False,
            )
        )({"city": city}, {"_meta": {}, "toolName": "get_forecast"})

        if result.is_error:
            if result.content and len(result.content) > 0:
                return result.content[0].text if isinstance(result.content[0], MCPContentItem) else result.content[0].get("text", "Payment required")
            return "Payment required"

        return result.content[0].text if result.content and isinstance(result.content[0], MCPContentItem) else (result.content[0].get("text", "Forecast data") if result.content else "No data")

    print(f"🚀 x402 MCP Server (Advanced) running on http://localhost:{PORT}")
    print("\n📋 Available tools:")
    print("   - get_weather (paid: $0.001) [with hooks]")
    print("   - get_forecast (paid: $0.005) [with hooks]")
    print("   - ping (free)")
    print(f"\n🔗 Connect via streamable HTTP: http://localhost:{PORT}/mcp")
    print("\n📊 Hooks enabled:")
    print("   - OnBeforeExecution: Rate limiting, validation")
    print("   - OnAfterExecution: Logging, metrics")
    print("   - OnAfterSettlement: Receipts, notifications")
    print("\n💡 This example uses create_payment_wrapper() with hooks and REAL MCP SDK.\n")

    # Run server with streamable HTTP transport
    mcp_server.run(transport="streamable-http", port=PORT)
