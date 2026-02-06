"""MCP Client with x402 Payment Support - Simple Example.

This example demonstrates the RECOMMENDED way to create an MCP client
using the high-level wrap_mcp_client_with_payment_from_config factory function
with REAL MCP SDK (mcp package from PyPI).

Run with: python main.py simple
"""

import asyncio
import os
import sys
from typing import Any

from dotenv import load_dotenv
from eth_account import Account
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from x402 import x402ClientSync
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.mcp import (
    MCPContentItem,
    MCPToolResult,
    wrap_mcp_client_with_payment_from_config,
)

load_dotenv()

EVM_PRIVATE_KEY = os.getenv("EVM_PRIVATE_KEY")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:4022")

if not EVM_PRIVATE_KEY:
    print("❌ EVM_PRIVATE_KEY environment variable is required")
    sys.exit(1)


class MCPClientAdapter:
    """Adapter that wraps mcp.ClientSession to x402.mcp.MCPClientInterface."""

    def __init__(self, session: ClientSession):
        """Initialize adapter with MCP client session."""
        self._session = session

    def connect(self, transport):
        """Connect - already connected via session."""
        pass

    def close(self):
        """Close session."""
        # Session cleanup handled by context manager
        pass

    def call_tool(self, name: str, args: dict[str, Any], meta: dict[str, Any] | None = None) -> MCPToolResult:
        """Call tool via MCP session."""
        from mcp.types import CallToolParams

        call_params = CallToolParams(
            name=name,
            arguments=args,
        )
        if meta:
            call_params.meta = meta

        result = asyncio.run(self._session.call_tool(call_params))

        # Convert to MCPToolResult format
        content = []
        for item in result.content:
            if hasattr(item, "text"):
                content.append(MCPContentItem(type="text", text=item.text))
            else:
                content.append(MCPContentItem(type=getattr(item, "type", "text"), text=str(item)))

        return MCPToolResult(
            content=content,
            is_error=result.is_error,
            meta=result.meta if hasattr(result, "meta") and result.meta else {},
        )

    def list_tools(self) -> list[dict[str, Any]]:
        """List tools via MCP session."""
        result = asyncio.run(self._session.list_tools())
        tools = []
        for tool in result.tools:
            tools.append({"name": tool.name, "description": tool.description})
        return tools


def run_simple() -> None:
    """Demonstrates the simple API using wrap_mcp_client_with_payment_from_config factory with REAL MCP SDK."""
    print("\n📦 Using SIMPLE API (wrap_mcp_client_with_payment_from_config factory) with REAL MCP SDK\n")
    print(f"🔌 Connecting to MCP server at: {MCP_SERVER_URL}")

    account = Account.from_key(EVM_PRIVATE_KEY)
    print(f"💳 Using wallet: {account.address}")

    async def connect_and_run():
        # Connect to REAL MCP server using streamable HTTP transport
        async with streamable_http_client(f"{MCP_SERVER_URL}/mcp") as (
            read_stream,
            write_stream,
            _,
        ):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()

                print("✅ Connected to MCP server\n")

                # Wrap with x402
                adapter = MCPClientAdapter(session)

                def on_payment_requested(context):
                    print(f"\n💰 Payment required for tool: {context.tool_name}")
                    print(
                        f"   Amount: {context.payment_required.accepts[0].amount} ({context.payment_required.accepts[0].asset})"
                    )
                    print(f"   Network: {context.payment_required.accepts[0].network}")
                    print("   Approving payment...\n")
                    return True

                x402_mcp = wrap_mcp_client_with_payment_from_config(
                    adapter,
                    [
                        {
                            "network": "eip155:84532",
                            "client": register_exact_evm_client(x402ClientSync(), EthAccountSigner(account)),
                        }
                    ],
                    auto_payment=True,
                    on_payment_requested=on_payment_requested,
                )

                # List tools
                print("📋 Discovering available tools...")
                tools = adapter.list_tools()
                print("Available tools:")
                for tool in tools:
                    print(f"   - {tool['name']}: {tool['description']}")
                print()

                # Test free tool
                print("━" + "━" * 50)
                print("🆓 Test 1: Calling free tool (ping)")
                print("━" + "━" * 50)

                ping_result = x402_mcp.call_tool("ping", {})

                if ping_result.content:
                    print(f"Response: {ping_result.content[0].text}")
                print(f"Payment made: {ping_result.payment_made}\n")

                # Test paid tool
                print("━" + "━" * 50)
                print("💰 Test 2: Calling paid tool (get_weather)")
                print("━" + "━" * 50)

                weather_result = x402_mcp.call_tool("get_weather", {"city": "San Francisco"})

                if weather_result.content:
                    print(f"Response: {weather_result.content[0].text}")
                print(f"Payment made: {weather_result.payment_made}")

                if weather_result.payment_response:
                    print("\n📦 Payment Receipt:")
                    print(f"   Success: {weather_result.payment_response.success}")
                    if weather_result.payment_response.transaction:
                        print(f"   Transaction: {weather_result.payment_response.transaction}")

                print("\n✅ Demo complete!")

    asyncio.run(connect_and_run())
