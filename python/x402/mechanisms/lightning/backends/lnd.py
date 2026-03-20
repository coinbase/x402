"""LND-backed Lightning invoice creation (optional gRPC deps)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from .base import LightningInvoiceBackend


class _SupportsAddInvoice(Protocol):
    def AddInvoice(self, req: Any) -> Any: ...


def _currency_for_network(network: str) -> None:
    if network not in ("lightning:mainnet", "lightning:testnet", "lightning:regtest"):
        raise ValueError(f"Unsupported Lightning network: {network}")


class LndLightningBackend(LightningInvoiceBackend):
    """Create invoices via an LND ``Lightning`` gRPC stub (sync).

    This class does not bundle generated protobufs. Pass:

    - ``stub``: an object with ``AddInvoice(request)`` (typically
      ``lnrpc.LightningStub(channel)``).
    - ``build_invoice_request``: maps ``value_sat: int`` to the protobuf
      ``Invoice`` message your stubs expect.

    ``grpcio`` and ``protobuf`` are imported lazily when calling
    ``create_invoice`` so that importing ``x402`` without Lightning extras
    does not fail.

    Example (with generated stubs)::

        import grpc
        import lnrpc_pb2 as ln
        import lnrpc_pb2_grpc as lnrpc
        channel = grpc.secure_channel("localhost:10009", creds)
        stub = lnrpc.LightningStub(channel)
        backend = LndLightningBackend(
            stub,
            build_invoice_request=lambda s: ln.Invoice(value=s),
            extract_payment_request=lambda r: r.payment_request,
        )
    """

    def __init__(
        self,
        stub: _SupportsAddInvoice,
        *,
        build_invoice_request: Callable[[int], Any],
        extract_payment_request: Callable[[Any], str],
        extract_destination: Callable[[Any], str] | None = None,
    ) -> None:
        self._stub = stub
        self._build_invoice_request = build_invoice_request
        self._extract_payment_request = extract_payment_request
        self._extract_destination = extract_destination

    def create_invoice(self, *, network: str, amount_msat: int) -> tuple[str, str]:
        try:
            import grpc  # noqa: F401
        except ImportError as e:
            raise ImportError(
                "LND backend requires grpcio. Install with: pip install x402[lightning-lnd]"
            ) from e

        _currency_for_network(network)
        if amount_msat % 1000 != 0:
            raise ValueError(
                "LND AddInvoice uses satoshi amounts; amount_msat must be divisible by 1000"
            )
        value_sat = amount_msat // 1000
        req = self._build_invoice_request(value_sat)
        try:
            resp = self._stub.AddInvoice(req)
        except Exception as e:
            raise ValueError(f"LND AddInvoice failed: {e}") from e

        bolt11 = self._extract_payment_request(resp)
        if self._extract_destination is not None:
            payee = self._extract_destination(resp)
        else:
            payee = ""
        return bolt11, payee
