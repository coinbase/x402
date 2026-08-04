"""
Cathedral ARKHE v17.2 – Intuition Bridge
Integração com o protocolo Intuition para armazenamento de atestados,
identidade descentralizada e governança da floresta.
"""
import logging
import json
from typing import Dict, List, Optional, Any
from decimal import Decimal

from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

logger = logging.getLogger("cathedral.integrations.intuition")

class IntuitionBridge:
    def __init__(self, config: dict):
        self.config = config
        self.w3 = Web3(Web3.HTTPProvider(config["rpc_url"]))
        if self.w3.is_connected() is False:
            raise ConnectionError("Não foi possível conectar ao Intuition Network RPC")
        # Adiciona middleware para redes PoA (ex: Base, Arbitrum)
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        self.contract_address = Web3.to_checksum_address(config["contract_address"])
        self.abi = config["contract_abi"]  # ABI do AtomWallet
        self.contract = self.w3.eth.contract(address=self.contract_address, abi=self.abi)
        self.account = self.w3.eth.account.from_key(config["private_key"])
        self.signer_address = self.account.address
        logger.info("IntuitionBridge inicializado. Signer: %s", self.signer_address)

    def create_atom(self, data_uri: str) -> int:
        """Cria um novo Atom (identificador descentralizado) no grafo."""
        tx = self.contract.functions.createAtom(data_uri).build_transaction({
            "from": self.signer_address,
            "nonce": self.w3.eth.get_transaction_count(self.signer_address),
            "gas": 500_000,
            "gasPrice": self.w3.eth.gas_price
        })
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.rawTransaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        # O Atom ID é emitido no evento AtomCreated (primeiro log)
        atom_id = receipt["logs"][0]["topics"][1].hex()
        return int(atom_id, 16)

    def create_triple(self, subject_id: int, predicate_id: int, object_id: int) -> int:
        """Cria uma Triple (relação estruturada) entre três Atoms."""
        tx = self.contract.functions.createTriple(subject_id, predicate_id, object_id).build_transaction({
            "from": self.signer_address,
            "nonce": self.w3.eth.get_transaction_count(self.signer_address),
            "gas": 500_000,
            "gasPrice": self.w3.eth.gas_price
        })
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.rawTransaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        triple_id = receipt["logs"][0]["topics"][1].hex()
        return int(triple_id, 16)

    def deposit_signal(self, target_id: int, amount_eth: Decimal, target_type: str = "atom") -> str:
        """
        Deposita ETH como Signal em um Atom ou Triple.
        target_type: 'atom' ou 'triple'
        """
        amount_wei = int(amount_eth * 10**18)
        if target_type == "atom":
            tx = self.contract.functions.depositAtom(target_id, amount_wei).build_transaction({
                "from": self.signer_address,
                "nonce": self.w3.eth.get_transaction_count(self.signer_address),
                "gas": 300_000,
                "gasPrice": self.w3.eth.gas_price
            })
        else:
            tx = self.contract.functions.depositTriple(target_id, amount_wei, True).build_transaction({
                "from": self.signer_address,
                "nonce": self.w3.eth.get_transaction_count(self.signer_address),
                "gas": 300_000,
                "gasPrice": self.w3.eth.gas_price
            })
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.rawTransaction)
        return tx_hash.hex()

    def query_graphql(self, query: str) -> dict:
        """Consulta o grafo de conhecimento via GraphQL (Rust Subnet)."""
        import requests
        endpoint = self.config.get("graphql_endpoint", "https://testnet.intuition.sh/v1/graphql")
        response = requests.post(endpoint, json={"query": query}, timeout=30)
        response.raise_for_status()
        return response.json()
