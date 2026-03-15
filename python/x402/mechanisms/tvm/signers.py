"""TVM signer implementations for TONAPI provider."""

from __future__ import annotations

from typing import Any

try:
    import httpx
except ImportError as e:
    raise ImportError(
        "TVM signers require httpx. Install with: pip install httpx"
    ) from e

from .constants import TONAPI_MAINNET_URL, TONAPI_TESTNET_URL


class TonapiProvider:
    """Combined read + settlement provider backed by TONAPI.

    Implements both ``FacilitatorTvmSigner`` read ops and settlement methods.
    """

    def __init__(self, api_key: str | None = None, testnet: bool = False) -> None:
        self._base = TONAPI_TESTNET_URL if testnet else TONAPI_MAINNET_URL
        headers: dict[str, str] = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self._client = httpx.AsyncClient(base_url=self._base, headers=headers)

    # ------------------------------------------------------------------
    # FacilitatorTvmSigner — read operations
    # ------------------------------------------------------------------

    async def get_seqno(self, address: str) -> int:
        resp = await self._client.get(f"/v2/wallet/{address}/seqno")
        resp.raise_for_status()
        return int(resp.json()["seqno"])

    async def get_jetton_wallet(self, master: str, owner: str) -> str:
        resp = await self._client.get(
            f"/v2/blockchain/accounts/{master}/methods/get_wallet_address",
            params={"args": [owner]},
        )
        resp.raise_for_status()
        stack = resp.json().get("decoded", {})
        return stack.get("jetton_wallet_address", stack.get("address", ""))

    async def get_account_state(self, address: str) -> dict[str, Any]:
        resp = await self._client.get(f"/v2/accounts/{address}")
        resp.raise_for_status()
        data = resp.json()
        return {
            "balance": int(data["balance"]),
            "status": data["status"],
            "code_hash": data.get("code_hash", ""),
        }

    async def get_transaction(self, tx_hash: str) -> dict[str, Any] | None:
        resp = await self._client.get(f"/v2/blockchain/transactions/{tx_hash}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------
    # Settlement — gasless operations
    # ------------------------------------------------------------------

    async def gasless_estimate(
        self,
        wallet_address: str,
        wallet_public_key: str,
        jetton_master: str,
        messages: list[dict[str, Any]],
    ) -> dict[str, Any]:
        resp = await self._client.post(
            f"/v2/gasless/estimate/{jetton_master}",
            json={
                "wallet_address": wallet_address,
                "wallet_public_key": wallet_public_key,
                "messages": messages,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def gasless_send(self, boc: str, wallet_public_key: str) -> str:
        resp = await self._client.post(
            "/v2/gasless/send",
            json={"boc": boc, "wallet_public_key": wallet_public_key},
        )
        resp.raise_for_status()
        return resp.text

    async def get_gasless_config(self) -> dict[str, Any]:
        resp = await self._client.get("/v2/gasless/config")
        resp.raise_for_status()
        return resp.json()
