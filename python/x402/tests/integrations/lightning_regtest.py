"""Helpers for Docker-backed Lightning regtest integration tests."""

from __future__ import annotations

import base64
import json
import os
import subprocess
from typing import Any
from urllib.parse import quote

from x402.mechanisms.lightning.backends.base import LightningInvoiceBackend
from x402.mechanisms.lightning.constants import LIGHTNING_REGTEST, SCHEME_EXACT
from x402.schemas import PaymentPayload, PaymentRequirements, SettleResponse, SupportedResponse, VerifyResponse


class LndRestClient:
    """Minimal LND REST client used by Layer 3 integration tests."""

    def __init__(
        self,
        *,
        rest_host: str,
        tls_cert_path: str | None = None,
        macaroon_path: str | None = None,
        timeout_seconds: int = 20,
    ) -> None:
        self._rest_host = rest_host.rstrip("/")
        self._timeout_seconds = timeout_seconds
        self._macaroon_hex = self._read_macaroon_hex(macaroon_path) if macaroon_path else None
        self._tls_verify: bool | str
        if tls_cert_path:
            self._tls_verify = tls_cert_path
        else:
            self._tls_verify = False

    @classmethod
    def from_env(cls, *, prefix: str) -> "LndRestClient":
        """Create a client from env vars for a specific node prefix."""

        rest_host = _required_env(f"{prefix}_REST_HOST")
        tls_cert_path = _optional_env(f"{prefix}_TLS_CERT_PATH")
        macaroon_path = _optional_env(f"{prefix}_MACAROON_PATH")
        return cls(
            rest_host=rest_host,
            tls_cert_path=tls_cert_path,
            macaroon_path=macaroon_path,
        )

    def get_info(self) -> dict:
        """Return node info from `/v1/getinfo`."""

        return self._request("GET", "/v1/getinfo")

    def list_channels(self) -> dict:
        """Return channels from `/v1/channels`."""

        return self._request("GET", "/v1/channels")

    def create_invoice(self, *, amount_sats: int, memo: str) -> dict:
        """Create an invoice using satoshi amount via `/v1/invoices`."""

        if amount_sats <= 0:
            raise ValueError("amount_sats must be > 0")
        body = {
            "value": str(amount_sats),
            "memo": memo,
        }
        return self._request("POST", "/v1/invoices", body=body)

    def pay_invoice(self, *, bolt11: str, fee_limit_sat: int = 10_000) -> dict:
        """Pay a BOLT11 invoice via `/v1/channels/transactions`."""

        body = {
            "payment_request": bolt11,
            "fee_limit": {"fixed": str(fee_limit_sat)},
        }
        return self._request("POST", "/v1/channels/transactions", body=body)

    def decode_invoice(self, *, bolt11: str) -> dict:
        """Decode a BOLT11 invoice via `/v1/payreq/{invoice}`."""

        encoded = quote(bolt11, safe="")
        return self._request("GET", f"/v1/payreq/{encoded}")

    @staticmethod
    def extract_preimage_hex(pay_response: dict) -> str:
        """Extract payment preimage from LND response as lowercase hex."""

        value = str(pay_response.get("payment_preimage") or "")
        if not value:
            raise ValueError("LND pay response missing payment_preimage")
        if _is_hex_32_bytes(value):
            return value.lower()
        try:
            decoded = base64.b64decode(value, validate=True)
        except Exception as e:  # pragma: no cover - depends on LND response format
            raise ValueError(f"Unsupported payment_preimage format: {value}") from e
        if len(decoded) != 32:
            raise ValueError(f"Decoded payment_preimage must be 32 bytes, got {len(decoded)}")
        return decoded.hex()

    @staticmethod
    def _read_macaroon_hex(macaroon_path: str) -> str:
        with open(macaroon_path, "rb") as file:
            return file.read().hex()

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        headers: dict[str, str] = {}
        if self._macaroon_hex:
            headers["Grpc-Metadata-macaroon"] = self._macaroon_hex

        request_body: bytes | None = None
        if body is not None:
            request_body = json_dumps(body).decode("utf-8")
            headers["Content-Type"] = "application/json"

        curl_command = [
            "curl",
            "--silent",
            "--show-error",
            "--fail",
            "--max-time",
            str(self._timeout_seconds),
            "--request",
            method,
        ]
        if self._tls_verify is False:
            curl_command.append("--insecure")
        else:
            curl_command.extend(["--cacert", str(self._tls_verify)])
        for key, value in headers.items():
            curl_command.extend(["--header", f"{key}: {value}"])
        if request_body is not None:
            curl_command.extend(["--data", request_body])
        curl_command.append(f"{self._rest_host}{path}")

        result = subprocess.run(curl_command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(
                f"LND REST request failed (exit={result.returncode}): {result.stderr.strip()}"
            )
        payload = result.stdout.strip()
        if not payload:
            return {}
        return json.loads(payload)


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if value:
        return value
    raise RuntimeError(f"Missing required env var: {name}")


def _optional_env(name: str) -> str | None:
    value = os.environ.get(name)
    if not value:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return stripped


def _is_hex_32_bytes(value: str) -> bool:
    if len(value) != 64:
        return False
    return all(ch in "0123456789abcdefABCDEF" for ch in value)


class LndInvoiceBackend(LightningInvoiceBackend):
    """Lightning invoice backend adapter backed by ``LndRestClient``."""

    def __init__(
        self,
        invoice_client: LndRestClient,
        *,
        payee_pubkey: str,
        memo_prefix: str = "x402-integration",
    ) -> None:
        self._invoice_client = invoice_client
        self._payee_pubkey = payee_pubkey
        self._memo_prefix = memo_prefix

    def create_invoice(self, *, network: str, amount_msat: int) -> tuple[str, str]:
        if network != LIGHTNING_REGTEST:
            raise ValueError(f"Unsupported Lightning network for regtest backend: {network}")
        if amount_msat <= 0:
            raise ValueError("amount_msat must be > 0")
        if amount_msat % 1000 != 0:
            raise ValueError("LND invoice creation requires satoshi amounts (msat divisible by 1000)")

        amount_sats = amount_msat // 1000
        response = self._invoice_client.create_invoice(
            amount_sats=amount_sats,
            memo=f"{self._memo_prefix}-{amount_sats}sat",
        )
        invoice = str(response.get("payment_request") or "")
        if not invoice:
            raise ValueError("LND create_invoice response missing payment_request")

        return invoice, self._payee_pubkey


class LndPreimageProvider:
    """Callable adapter that pays invoices and returns preimages for client scheme."""

    def __init__(self, payer_client: LndRestClient) -> None:
        self._payer_client = payer_client

    def __call__(self, requirements: PaymentRequirements) -> str:
        invoice = str((requirements.extra or {}).get("invoice") or "")
        if not invoice:
            raise ValueError("payment requirements missing extra.invoice")
        response = self._payer_client.pay_invoice(bolt11=invoice)
        return LndRestClient.extract_preimage_hex(response)


class LightningFacilitatorClientSync:
    """Facilitator client wrapper for ``x402ResourceServerSync`` in Lightning tests."""

    scheme = SCHEME_EXACT
    network = LIGHTNING_REGTEST
    x402_version = 2

    def __init__(self, facilitator: Any) -> None:
        self._facilitator = facilitator

    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        return self._facilitator.verify(payload, requirements)

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        return self._facilitator.settle(payload, requirements)

    def get_supported(self) -> SupportedResponse:
        return self._facilitator.get_supported()


def json_dumps(payload: dict) -> bytes:
    return json.dumps(payload).encode("utf-8")
