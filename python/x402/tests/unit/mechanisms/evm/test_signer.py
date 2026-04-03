"""Tests for EVM signer implementations."""

from types import SimpleNamespace

import pytest

try:
    from eth_account import Account
except ImportError:
    pytest.skip("EVM signers require eth_account", allow_module_level=True)

from x402.mechanisms.evm.signers import EthAccountSigner, FacilitatorWeb3Signer


class _FakeBuiltTx:
    def __init__(self, raw_transaction: bytes):
        self.raw_transaction = raw_transaction


class _FakeContractCall:
    def __init__(self, sink: dict):
        self._sink = sink

    def build_transaction(self, tx: dict) -> dict:
        self._sink["tx"] = tx
        return tx


class _FakeContractFunctions:
    def __init__(self, sink: dict):
        self._sink = sink

    def __getattr__(self, _name: str):
        def caller(*args):
            self._sink["args"] = args
            return _FakeContractCall(self._sink)

        return caller


class _FakeContract:
    def __init__(self, sink: dict):
        self.functions = _FakeContractFunctions(sink)


class _FakeEth:
    def __init__(self, contract_sink: dict | None = None):
        self.contract_sink = contract_sink
        self.gas_price = 123456
        self.sent_raw_transaction: bytes | None = None

    def contract(self, address: str, abi: list[dict]):
        if self.contract_sink is None:
            raise AssertionError("contract() should not be called in this test")
        self.contract_sink["address"] = address
        self.contract_sink["abi"] = abi
        return _FakeContract(self.contract_sink)

    def get_transaction_count(self, _address: str) -> int:
        return 7

    def send_raw_transaction(self, raw_transaction: bytes) -> bytes:
        self.sent_raw_transaction = raw_transaction
        return bytes.fromhex("12" * 32)


class _FakeSignerAccount:
    def __init__(self, address: str):
        self.address = address
        self.signed_txs: list[dict] = []

    def sign_transaction(self, tx: dict) -> _FakeBuiltTx:
        self.signed_txs.append(tx)
        return _FakeBuiltTx(b"signed")


class TestEthAccountSigner:
    """Test EthAccountSigner client-side signer."""

    def test_should_create_signer_from_account(self):
        """Should create signer from LocalAccount."""
        account = Account.create()
        signer = EthAccountSigner(account)

        assert signer.address is not None
        assert signer.address.startswith("0x")
        assert len(signer.address) == 42  # 0x + 40 hex chars

    def test_address_should_return_checksummed_address(self):
        """address property should return checksummed address."""
        account = Account.create()
        signer = EthAccountSigner(account)

        assert signer.address == account.address

    def test_should_sign_typed_data(self):
        """Should sign EIP-712 typed data."""
        account = Account.create()
        signer = EthAccountSigner(account)

        from x402.mechanisms.evm.types import TypedDataDomain, TypedDataField

        domain = TypedDataDomain(
            name="USD Coin",
            version="2",
            chain_id=8453,
            verifying_contract="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        )

        types = {
            "TransferWithAuthorization": [
                TypedDataField(name="from", type="address"),
                TypedDataField(name="to", type="address"),
                TypedDataField(name="value", type="uint256"),
                TypedDataField(name="validAfter", type="uint256"),
                TypedDataField(name="validBefore", type="uint256"),
                TypedDataField(name="nonce", type="bytes32"),
            ]
        }

        message = {
            "from": account.address,
            "to": "0x1234567890123456789012345678901234567890",
            "value": "1000000",
            "validAfter": "1000000000",
            "validBefore": "1000003600",
            "nonce": "0x" + "00" * 32,
        }

        signature = signer.sign_typed_data(domain, types, "TransferWithAuthorization", message)

        assert signature is not None
        assert isinstance(signature, bytes)
        assert len(signature) >= 65  # ECDSA signature is 65 bytes


class TestFacilitatorWeb3Signer:
    """Test FacilitatorWeb3Signer facilitator-side signer."""

    def test_should_create_signer_with_private_key(self):
        """Should create signer with private key."""
        account = Account.create()
        private_key = account.key.hex()

        signer = FacilitatorWeb3Signer(
            private_key=private_key,
            rpc_url="https://sepolia.base.org",
        )

        assert signer.address is not None
        assert signer.address.startswith("0x")

    def test_should_create_signer_with_private_key_without_0x_prefix(self):
        """Should create signer with private key without 0x prefix."""
        account = Account.create()
        private_key = account.key.hex().removeprefix("0x")

        signer = FacilitatorWeb3Signer(
            private_key=private_key,
            rpc_url="https://sepolia.base.org",
        )

        assert signer.address == account.address

    def test_get_addresses_should_return_list_with_signer_address(self):
        """get_addresses should return list containing signer address."""
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
        )

        addresses = signer.get_addresses()

        assert isinstance(addresses, list)
        assert len(addresses) == 1
        assert addresses[0] == account.address
        assert all(isinstance(addr, str) for addr in addresses)

    def test_address_property_should_return_checksummed_address(self):
        """address property should return checksummed address."""
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
        )

        assert signer.address == account.address

    def test_should_have_required_methods(self):
        """Should have all required facilitator signer methods."""
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
        )

        # Verify all required methods exist
        assert hasattr(signer, "get_addresses")
        assert hasattr(signer, "read_contract")
        assert hasattr(signer, "verify_typed_data")
        assert hasattr(signer, "write_contract")
        assert hasattr(signer, "send_transaction")
        assert hasattr(signer, "wait_for_transaction_receipt")
        assert hasattr(signer, "get_balance")
        assert hasattr(signer, "get_chain_id")
        assert hasattr(signer, "get_code")

        # Verify they are callable
        assert callable(signer.get_addresses)
        assert callable(signer.read_contract)
        assert callable(signer.verify_typed_data)
        assert callable(signer.write_contract)
        assert callable(signer.send_transaction)
        assert callable(signer.wait_for_transaction_receipt)
        assert callable(signer.get_balance)
        assert callable(signer.get_chain_id)
        assert callable(signer.get_code)

    def test_write_contract_should_use_configured_default_gas_limit(self):
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
            gas_limit=450000,
        )
        contract_sink: dict = {}
        fake_eth = _FakeEth(contract_sink)
        fake_account = _FakeSignerAccount(account.address)
        signer._w3 = SimpleNamespace(eth=fake_eth)
        signer._account = fake_account

        signer.write_contract(
            "0x1234567890123456789012345678901234567890",
            [],
            "transferWithAuthorization",
            "arg1",
        )

        assert contract_sink["tx"]["gas"] == 450000
        assert fake_account.signed_txs[0]["gas"] == 450000

    def test_write_contract_should_allow_per_call_gas_override(self):
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
            gas_limit=450000,
        )
        contract_sink: dict = {}
        fake_eth = _FakeEth(contract_sink)
        fake_account = _FakeSignerAccount(account.address)
        signer._w3 = SimpleNamespace(eth=fake_eth)
        signer._account = fake_account

        signer.write_contract(
            "0x1234567890123456789012345678901234567890",
            [],
            "transferWithAuthorization",
            "arg1",
            gas=510000,
        )

        assert contract_sink["tx"]["gas"] == 510000
        assert fake_account.signed_txs[0]["gas"] == 510000

    def test_send_transaction_should_use_configured_default_gas_limit(self):
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
            gas_limit=450000,
        )
        fake_eth = _FakeEth()
        fake_account = _FakeSignerAccount(account.address)
        signer._w3 = SimpleNamespace(eth=fake_eth)
        signer._account = fake_account

        signer.send_transaction("0x1234567890123456789012345678901234567890", b"\x01\x02")

        assert fake_account.signed_txs[0]["gas"] == 450000

    def test_send_transaction_should_allow_per_call_gas_override(self):
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
            gas_limit=450000,
        )
        fake_eth = _FakeEth()
        fake_account = _FakeSignerAccount(account.address)
        signer._w3 = SimpleNamespace(eth=fake_eth)
        signer._account = fake_account

        signer.send_transaction(
            "0x1234567890123456789012345678901234567890",
            b"\x01\x02",
            gas=510000,
        )

        assert fake_account.signed_txs[0]["gas"] == 510000


class TestSignerProtocols:
    """Test that signers implement expected protocols."""

    def test_eth_account_signer_implements_client_protocol(self):
        """EthAccountSigner should implement ClientEvmSigner protocol."""
        account = Account.create()
        signer = EthAccountSigner(account)

        # ClientEvmSigner protocol requires:
        assert hasattr(signer, "address")
        assert hasattr(signer, "sign_typed_data")

    def test_facilitator_signer_implements_facilitator_protocol(self):
        """FacilitatorWeb3Signer should implement FacilitatorEvmSigner protocol."""
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
        )

        # FacilitatorEvmSigner protocol requires:
        assert hasattr(signer, "get_addresses")
        assert hasattr(signer, "read_contract")
        assert hasattr(signer, "verify_typed_data")
        assert hasattr(signer, "write_contract")
        assert hasattr(signer, "send_transaction")
        assert hasattr(signer, "wait_for_transaction_receipt")
        assert hasattr(signer, "get_balance")
        assert hasattr(signer, "get_chain_id")
        assert hasattr(signer, "get_code")
