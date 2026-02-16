"""Anthropic Claude Chatbot with CDP MCP Bazaar + x402 Payments.

A complete chatbot implementation showing how to integrate:
- Anthropic Claude (the LLM)
- MCP Client (tool discovery and execution)
- x402 Payment Protocol (automatic payment for paid tools)

Connects to the CDP MCP Bazaar via Streamable HTTP with JWT authentication.
This demonstrates the ACTUAL MCP client methods used in production chatbots.

Usage:
    python main.py
"""

import asyncio
import json
import os
import sys
from typing import Any

import anthropic
import httpx
from dotenv import load_dotenv
from eth_account import Account
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from cdp.auth import JwtOptions, generate_jwt
from x402 import x402ClientSync
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.mcp import MCPToolCallResult, x402MCPClient
from x402.mcp.types import MCPToolResult

load_dotenv()

# ============================================================================
# Configuration
# ============================================================================

SERVER_URL = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp"
MODEL_NAME = "claude-3-haiku-20240307"

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    print("ANTHROPIC_API_KEY environment variable is required")
    print("   Get your API key from: https://console.anthropic.com/")
    sys.exit(1)

EVM_PRIVATE_KEY = os.getenv("EVM_PRIVATE_KEY")
if not EVM_PRIVATE_KEY:
    print("EVM_PRIVATE_KEY environment variable is required")
    print("   Generate one with: cast wallet new")
    sys.exit(1)

CDP_API_KEY_ID = os.getenv("CDP_API_KEY_ID")
CDP_API_KEY_SECRET = os.getenv("CDP_API_KEY_SECRET")
if not CDP_API_KEY_ID or not CDP_API_KEY_SECRET:
    print("CDP_API_KEY_ID and CDP_API_KEY_SECRET are required for discovery endpoints")
    sys.exit(1)


# ============================================================================
# MCP Client Adapter
# ============================================================================


class MCPClientAdapter:
    """Adapter that wraps mcp.ClientSession for the x402 MCP client interface."""

    def __init__(self, session: ClientSession):
        """Initialize adapter with MCP client session."""
        self._session = session

    async def connect(self, transport: Any) -> None:
        """Connect - already connected via session context manager."""
        pass

    async def close(self) -> None:
        """Close session."""
        pass

    async def call_tool(
        self, params: dict[str, Any], **kwargs: Any
    ) -> MCPToolResult:
        """Call tool via MCP session."""
        name = params.get("name", "")
        args = params.get("arguments", {})
        meta = params.get("_meta")

        result = await self._session.call_tool(
            name=name,
            arguments=args or {},
            meta=meta,
        )

        content = []
        for item in result.content:
            if hasattr(item, "text"):
                content.append({"type": "text", "text": item.text})
            else:
                content.append({"type": getattr(item, "type", "text"), "text": str(item)})

        meta_dict = {}
        if hasattr(result, "meta") and result.meta:
            meta_dict = dict(result.meta) if result.meta else {}

        return MCPToolResult(
            content=content,
            is_error=getattr(result, "isError", False) or getattr(result, "is_error", False),
            meta=meta_dict,
        )

    async def list_tools(self) -> Any:
        """List available tools from the server."""
        return await self._session.list_tools()


# ============================================================================
# Chatbot Implementation
# ============================================================================


async def main() -> None:
    """Main chatbot loop - demonstrates real MCP client usage patterns."""
    print("\nAnthropic Claude + MCP Chatbot with x402 Payments")
    print(f"   Model: {MODEL_NAME}")
    print("   Connected to CDP MCP Bazaar")
    print("=" * 70)

    # Initialize Anthropic (the LLM)
    anthropic_client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    # Initialize x402 payment client
    account = Account.from_key(EVM_PRIVATE_KEY)
    print(f"Wallet address: {account.address}")

    # Generate CDP JWT for authenticating with the facilitator discovery endpoint
    jwt = generate_jwt(
        JwtOptions(
            api_key_id=CDP_API_KEY_ID,
            api_key_secret=CDP_API_KEY_SECRET,
            request_method="POST",
            request_host="api.cdp.coinbase.com",
            request_path="/platform/v2/x402/discovery/mcp",
            expires_in=120,
        )
    )

    # ========================================================================
    # MCP TOUCHPOINT #1: connect via Streamable HTTP + JWT
    # ========================================================================
    print(f"Connecting to CDP MCP Bazaar: {SERVER_URL}")

    async with httpx.AsyncClient(
        headers={"Authorization": f"Bearer {jwt}"},
    ) as http_client:
        async with streamable_http_client(SERVER_URL, http_client=http_client) as (
            read_stream,
            write_stream,
            _,
        ):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                print("Connected to MCP server")

                # Create adapter and wrap with x402
                adapter = MCPClientAdapter(session)

                payment_client = x402ClientSync()
                register_exact_evm_client(payment_client, EthAccountSigner(account))

                def on_payment_requested(context: Any) -> bool:
                    price = context.payment_required.accepts[0]
                    print(f"\n  Payment requested for tool: {context.tool_name}")
                    print(f"   Amount: {price.amount} ({price.asset})")
                    print(f"   Network: {price.network}")
                    print("   Approving payment...\n")
                    return True  # Auto-approve

                x402_mcp = x402MCPClient(
                    adapter,
                    payment_client,
                    auto_payment=True,
                    on_payment_requested=on_payment_requested,
                )

                # ================================================================
                # MCP TOUCHPOINT #2: listTools()
                # ================================================================
                print("\nDiscovering tools from MCP server...")
                tools_result = await adapter.list_tools()
                mcp_tools = tools_result.tools
                print(f"Found {len(mcp_tools)} tools:")
                for tool in mcp_tools:
                    is_paid = (
                        tool.description
                        and ("payment" in tool.description.lower() or "$" in tool.description)
                    )
                    prefix = "[paid]" if is_paid else "[free]"
                    print(f"   {prefix} {tool.name}")

                # Convert MCP tools to Anthropic format
                anthropic_tools: list[dict[str, Any]] = []
                for tool in mcp_tools:
                    anthropic_tools.append({
                        "name": tool.name,
                        "description": tool.description or "",
                        "input_schema": {
                            **(tool.inputSchema or {}),
                            "type": "object",
                        },
                    })

                print("Converted to Anthropic tool format")
                print("=" * 70)

                # ================================================================
                # Interactive Chat Loop
                # ================================================================
                print("\nChat started! Try asking:")
                print("   - 'What's the weather in Tokyo?'")
                print("   - 'Can you ping the server?'")
                print("   - 'quit' to exit\n")

                conversation_history: list[dict[str, Any]] = [
                    {
                        "role": "user",
                        "content": "You are a helpful assistant with access to MCP tools. Be concise and friendly.",
                    },
                ]

                while True:
                    try:
                        user_input = input("You: ").strip()
                    except (EOFError, KeyboardInterrupt):
                        print("\n\nClosing connections...")
                        break

                    if not user_input:
                        continue

                    if user_input.lower() in ("quit", "exit"):
                        print("\nClosing connections...")
                        break

                    # Add user message to history
                    conversation_history.append({
                        "role": "user",
                        "content": user_input,
                    })

                    # Anthropic messages.create
                    response = await anthropic_client.messages.create(
                        model=MODEL_NAME,
                        max_tokens=1024,
                        messages=conversation_history,
                        tools=anthropic_tools,
                    )

                    # Tool execution loop
                    while response.stop_reason == "tool_use":
                        # Add assistant message to history
                        conversation_history.append({
                            "role": "assistant",
                            "content": response.content,
                        })

                        tool_results: list[dict[str, Any]] = []

                        for content_block in response.content:
                            if content_block.type != "tool_use":
                                continue

                            tool_name = content_block.name
                            tool_args = content_block.input or {}

                            if tool_name == "search_resources":
                                print("\nSearching for available tools...")
                            elif tool_name == "proxy_tool_call":
                                selected = (tool_args or {}).get("toolName", tool_name)
                                print(f"\nSelected tool: {selected}")
                            else:
                                print(f"\nSelected tool: {tool_name}")

                            try:
                                # Remove _meta from args (protocol-level, not tool args)
                                clean_args = {k: v for k, v in (tool_args or {}).items() if k != "_meta"}

                                mcp_result: MCPToolCallResult = await x402_mcp.call_tool(
                                    tool_name, clean_args
                                )

                                # Show search results if this was a search
                                if tool_name == "search_resources" and mcp_result.content:
                                    try:
                                        first = mcp_result.content[0]
                                        text = first.get("text", json.dumps(first)) if isinstance(first, dict) else str(first)
                                        search_result = json.loads(text) if isinstance(text, str) else text
                                        if search_result.get("tools"):
                                            print(f"   Found {len(search_result['tools'])} tool(s):")
                                            for t in search_result["tools"]:
                                                if t.get("name"):
                                                    print(f"      • {t['name']}")
                                    except (json.JSONDecodeError, KeyError):
                                        pass

                                if mcp_result.payment_made and mcp_result.payment_response:
                                    txn = getattr(mcp_result.payment_response, "transaction", None)
                                    if txn:
                                        print(f"Payment transaction: {txn}")

                                result_text = "No content returned"
                                if mcp_result.content:
                                    first = mcp_result.content[0]
                                    if isinstance(first, dict):
                                        result_text = first.get("text", json.dumps(first))
                                    elif hasattr(first, "text"):
                                        result_text = first.text
                                    else:
                                        result_text = str(first)

                                tool_results.append({
                                    "type": "tool_result",
                                    "tool_use_id": content_block.id,
                                    "content": result_text if isinstance(result_text, str) else json.dumps(result_text),
                                })

                            except Exception as e:
                                print(f"   Error: {e}")
                                tool_results.append({
                                    "type": "tool_result",
                                    "tool_use_id": content_block.id,
                                    "content": f"Error: {e}",
                                })

                        # Add tool results to conversation
                        conversation_history.append({
                            "role": "user",
                            "content": tool_results,
                        })

                        # Get LLM response after tool results
                        response = await anthropic_client.messages.create(
                            model=MODEL_NAME,
                            max_tokens=1024,
                            messages=conversation_history,
                            tools=anthropic_tools,
                        )

                    # Display final assistant response
                    text_parts = [
                        block.text for block in response.content
                        if block.type == "text"
                    ]
                    if text_parts:
                        conversation_history.append({
                            "role": "assistant",
                            "content": response.content,
                        })
                        print(f"\nBot: {''.join(text_parts)}\n")

    print("Goodbye!\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except BaseException as e:
        import traceback

        print(f"\nFatal error: {e}")
        if hasattr(e, "exceptions"):  # ExceptionGroup (Python 3.11+)
            for exc in e.exceptions:
                print(f"  - {exc}")
                traceback.print_exception(type(exc), exc, exc.__traceback__)
        else:
            traceback.print_exc()
        sys.exit(1)
