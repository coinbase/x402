"""Helpers for Polar-backed Lightning regtest integration tests."""

from __future__ import annotations

import base64
import os
from urllib.parse import quote

import requests


class LndRestClient:
    """Minimal LND REST client used by Layer 3 integration tests."""

    def __init__(
        self,
        *,
        rest_host: str,
        tls_cert_path: str,
        macaroon_path: str,
        timeout_seconds: int = 20,
    ) -> None:
        self._rest_host = rest_host.rstrip("/")
        self._tls_cert_path = tls_cert_path
        self._timeout_seconds = timeout_seconds
        self._macaroon_hex = self._read_macaroon_hex(macaroon_path)

    @classmethod
    def from_env(cls, *, prefix: str) -> "LndRestClient":
        """Create a client from env vars for a specific node prefix."""

        rest_host = _required_env(f"{prefix}_REST_HOST")
        tls_cert_path = _required_env(f"{prefix}_TLS_CERT_PATH")
        macaroon_path = _required_env(f"{prefix}_MACAROON_PATH")
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
        return self._request("POST", "/v1/invoices", json=body)

    def pay_invoice(self, *, bolt11: str, fee_limit_sat: int = 10_000) -> dict:
        """Pay a BOLT11 invoice via `/v1/channels/transactions`."""

        body = {
            "payment_request": bolt11,
            "timeout_seconds": 60,
            "fee_limit": {"fixed": str(fee_limit_sat)},
        }
        return self._request("POST", "/v1/channels/transactions", json=body)

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

    def _request(self, method: str, path: str, json: dict | None = None) -> dict:
        response = requests.request(
            method=method,
            url=f"{self._rest_host}{path}",
            headers={"Grpc-Metadata-macaroon": self._macaroon_hex},
            json=json,
            verify=self._tls_cert_path,
            timeout=self._timeout_seconds,
        )
        response.raise_for_status()
        return response.json()


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if value:
        return value
    raise RuntimeError(f"Missing required env var: {name}")


def _is_hex_32_bytes(value: str) -> bool:
    if len(value) != 64:
        return False
    return all(ch in "0123456789abcdefABCDEF" for ch in value)
