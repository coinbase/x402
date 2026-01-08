"""Resource server extension for Bazaar discovery.

This module provides the bazaar_resource_server_extension which enriches
discovery extensions with HTTP method information from the request context.
"""

from __future__ import annotations

from typing import Any

from .types import BAZAAR


def _is_http_request_context(ctx: Any) -> bool:
    """Check if context is an HTTP request context.

    Args:
        ctx: The context to check.

    Returns:
        True if context has a method attribute.
    """
    return hasattr(ctx, "method") and isinstance(getattr(ctx, "method", None), str)


class BazaarResourceServerExtension:
    """Resource server extension that enriches discovery extensions with HTTP method.

    This extension automatically injects the HTTP method from the request context
    into the discovery extension info and schema.

    Usage:
        ```python
        from x402 import x402ResourceServer
        from x402.extensions.bazaar import bazaar_resource_server_extension

        server = x402ResourceServer(facilitator_client)
        server.register_extension(bazaar_resource_server_extension)
        ```
    """

    @property
    def key(self) -> str:
        """Extension key."""
        return BAZAAR

    def enrich_declaration(
        self,
        declaration: Any,
        transport_context: Any,
    ) -> Any:
        """Enrich extension declaration with HTTP method from transport context.

        Args:
            declaration: The extension declaration to enrich.
            transport_context: Framework-specific context (e.g., HTTP request).

        Returns:
            Enriched declaration with HTTP method added.
        """
        if not _is_http_request_context(transport_context):
            return declaration

        method = transport_context.method

        # Handle both dict and Pydantic model
        if hasattr(declaration, "model_dump"):
            ext = declaration.model_dump(by_alias=True)
        elif isinstance(declaration, dict):
            ext = dict(declaration)
        else:
            return declaration

        # Get or create info section
        info = ext.get("info", {})
        if not isinstance(info, dict):
            if hasattr(info, "model_dump"):
                info = info.model_dump(by_alias=True)
            else:
                info = {}

        # Get or create input section
        input_data = info.get("input", {})
        if not isinstance(input_data, dict):
            if hasattr(input_data, "model_dump"):
                input_data = input_data.model_dump(by_alias=True)
            else:
                input_data = {}

        # Inject method into input
        input_data["method"] = method
        info["input"] = input_data
        ext["info"] = info

        # Update schema to require method
        schema = ext.get("schema", {})
        if isinstance(schema, dict):
            properties = schema.get("properties", {})
            if isinstance(properties, dict):
                input_schema = properties.get("input", {})
                if isinstance(input_schema, dict):
                    required = list(input_schema.get("required", []))
                    if "method" not in required:
                        required.append("method")
                    input_schema["required"] = required
                    properties["input"] = input_schema
                schema["properties"] = properties
            ext["schema"] = schema

        return ext


# Singleton instance for convenience
bazaar_resource_server_extension = BazaarResourceServerExtension()
