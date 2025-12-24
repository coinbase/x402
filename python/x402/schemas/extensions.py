"""Extension types for the x402 Python SDK."""

from typing import Any, Protocol


class ResourceServerExtension(Protocol):
    """Interface for resource server extensions (e.g., bazaar).

    Extensions can enrich payment declarations with additional data
    based on the transport context (e.g., HTTP request).
    """

    @property
    def key(self) -> str:
        """Unique extension key (e.g., 'bazaar')."""
        ...

    def enrich_declaration(
        self,
        declaration: Any,
        transport_context: Any,
    ) -> Any:
        """Enrich extension declaration with transport-specific data.

        Args:
            declaration: The extension declaration to enrich.
            transport_context: Framework-specific context (e.g., HTTP request).

        Returns:
            Enriched declaration.
        """
        ...

