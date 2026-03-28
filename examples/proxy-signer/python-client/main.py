"""x402 proxy-signer client example.

Demonstrates ProxyEvmSigner and ProxySvmSigner classes that satisfy the x402
signer protocols by forwarding all signing operations to a remote Java server
backed by the Coinbase CDP SDK.

Makes two paid requests: one preferring EVM, one preferring Solana.
Uses lifecycle hooks to log payment events.
"""

from __future__ import annotations

import base64
import os
import sys
from typing import Any

import requests as http
from dotenv import load_dotenv
from solders.message import MessageV0
from solders.pubkey import Pubkey
from solders.signature import Signature
from solders.transaction import VersionedTransaction

from x402 import x402ClientSync, prefer_network
from x402.http import x402HTTPClientSync
from x402.http.clients import x402_requests
from x402.mechanisms.evm.exact.register import register_exact_evm_client
from x402.mechanisms.evm.types import TypedDataDomain, TypedDataField
from x402.mechanisms.svm.exact.register import register_exact_svm_client

load_dotenv()


# ---------------------------------------------------------------------------
# ProxyEvmSigner – satisfies x402 ClientEvmSigner Protocol
# ---------------------------------------------------------------------------


class ProxyEvmSigner:
    """EVM signer that proxies sign_typed_data to a remote Java server."""

    def __init__(self, proxy_url: str) -> None:
        self._proxy_url = proxy_url
        resp = http.get(f"{proxy_url}/evm/address")
        resp.raise_for_status()
        self._address: str = resp.json()["address"]

    @property
    def address(self) -> str:
        return self._address

    def sign_typed_data(
        self,
        domain: TypedDataDomain,
        types: dict[str, list[TypedDataField]],
        primary_type: str,
        message: dict[str, Any],
    ) -> bytes:
        def _jsonable(obj: Any) -> Any:
            """Recursively convert bytes to hex strings for JSON serialization."""
            if isinstance(obj, bytes):
                return "0x" + obj.hex()
            if isinstance(obj, dict):
                return {k: _jsonable(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [_jsonable(v) for v in obj]
            return obj

        payload = _jsonable({
            "domain": {
                "name": domain.name,
                "version": domain.version,
                "chainId": domain.chain_id,
                "verifyingContract": domain.verifying_contract,
            },
            "types": {
                k: [{"name": f.name, "type": f.type} for f in v]
                for k, v in types.items()
            },
            "primaryType": primary_type,
            "message": message,
        })
        resp = http.post(f"{self._proxy_url}/evm/sign-typed-data", json=payload)
        resp.raise_for_status()
        sig_hex: str = resp.json()["signature"]
        if sig_hex.startswith("0x"):
            sig_hex = sig_hex[2:]
        return bytes.fromhex(sig_hex)


# ---------------------------------------------------------------------------
# ProxySvmSigner – duck-types x402 ClientSvmSigner Protocol
# ---------------------------------------------------------------------------


class _RemoteKeypair:
    """Mock keypair whose sign_message routes through the Java proxy.

    The ExactSvmScheme calls signer.keypair.sign_message(msg_bytes) internally.
    We intercept that call, wrap the message bytes into a full transaction,
    send it to the proxy's /svm/partial-sign-transaction, and extract our
    signature from the response.
    """

    def __init__(self, proxy_url: str, address: str) -> None:
        self._proxy_url = proxy_url
        self._address = address

    def pubkey(self) -> Pubkey:
        return Pubkey.from_string(self._address)

    def sign_message(self, msg_bytes: bytes) -> Signature:
        message = MessageV0.from_bytes(msg_bytes[1:])

        num_signers = message.header.num_required_signatures
        placeholders = [Signature.default()] * num_signers
        tx = VersionedTransaction.populate(message, placeholders)

        tx_base64 = base64.b64encode(bytes(tx)).decode("utf-8")
        resp = http.post(
            f"{self._proxy_url}/svm/partial-sign-transaction",
            json={"transaction": tx_base64},
        )
        resp.raise_for_status()
        signed_base64: str = resp.json()["signedTransaction"]

        signed_tx = VersionedTransaction.from_bytes(base64.b64decode(signed_base64))

        account_keys = list(message.account_keys)
        our_pubkey = Pubkey.from_string(self._address)
        for i, key in enumerate(account_keys):
            if key == our_pubkey:
                return signed_tx.signatures[i]

        raise ValueError(f"Address {self._address} not found in transaction signers")


class ProxySvmSigner:
    """SVM signer that proxies transaction signing to a remote Java server."""

    def __init__(self, proxy_url: str) -> None:
        self._proxy_url = proxy_url
        resp = http.get(f"{proxy_url}/svm/address")
        resp.raise_for_status()
        self._address: str = resp.json()["address"]
        self._remote_keypair = _RemoteKeypair(proxy_url, self._address)

    @property
    def address(self) -> str:
        return self._address

    @property
    def keypair(self) -> _RemoteKeypair:
        return self._remote_keypair

    def sign_transaction(self, tx: VersionedTransaction) -> VersionedTransaction:
        # Not called by ExactSvmScheme (it uses keypair.sign_message); here for Protocol completeness
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Helper: make a paid request and print results
# ---------------------------------------------------------------------------


def pay_for_resource(label: str, session: Any, http_client: x402HTTPClientSync, url: str) -> None:
    print(f"--- {label} ---")
    response = session.get(url)
    print(f"Response: {response.text}")

    if response.ok:
        try:
            settle = http_client.get_payment_settle_response(
                lambda name: response.headers.get(name)
            )
            print(f"Settled on {settle.network} tx={settle.transaction}\n")
        except ValueError:
            print("No payment response header found\n")
    else:
        print(f"Status: {response.status_code}\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def create_client_preferring(
    network: str,
    evm_signer: ProxyEvmSigner,
    svm_signer: ProxySvmSigner,
) -> x402ClientSync:
    """Create an x402 client that prefers a given network."""
    client = x402ClientSync()
    register_exact_evm_client(client, evm_signer)
    register_exact_svm_client(client, svm_signer)
    client.register_policy(prefer_network(network))
    client.on_before_payment_creation(
        lambda ctx: print(f"[before] Signing payment on {ctx.selected_requirements.network} ({ctx.selected_requirements.scheme})")
    )
    client.on_after_payment_creation(
        lambda ctx: print(f"[after]  Payment created (v{ctx.payment_payload.x402_version})")
    )
    return client


def main() -> None:
    proxy_url = os.getenv("PROXY_SIGNER_URL", "http://localhost:8080")
    base_url = os.getenv("RESOURCE_SERVER_URL")
    endpoint_path = os.getenv("ENDPOINT_PATH")

    if not base_url or not endpoint_path:
        print("Error: RESOURCE_SERVER_URL and ENDPOINT_PATH are required.")
        print("Copy .env-local to .env and fill in the values.")
        sys.exit(1)

    url = f"{base_url}{endpoint_path}"

    print(f"Proxy signer URL: {proxy_url}")

    evm_signer = ProxyEvmSigner(proxy_url)
    print(f"EVM address (from proxy): {evm_signer.address}")

    svm_signer = ProxySvmSigner(proxy_url)
    print(f"SVM address (from proxy): {svm_signer.address}\n")

    # -- Request 1: prefer EVM (Base Sepolia) over Solana --
    evm_client = create_client_preferring("eip155:84532", evm_signer, svm_signer)
    with x402_requests(evm_client) as session:
        pay_for_resource("Request 1: prefer EVM", session, x402HTTPClientSync(evm_client), url)

    # -- Request 2: prefer Solana over EVM --
    sol_client = create_client_preferring("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", evm_signer, svm_signer)
    with x402_requests(sol_client) as session:
        pay_for_resource("Request 2: prefer Solana", session, x402HTTPClientSync(sol_client), url)


if __name__ == "__main__":
    main()
