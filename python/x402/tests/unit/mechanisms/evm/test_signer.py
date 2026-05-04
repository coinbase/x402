"""Tests for EVM signer implementations."""

from unittest.mock import MagicMock, patch

import pytest

try:
    from eth_account import Account
except ImportError:
    pytest.skip("EVM signers require eth_account", allow_module_level=True)

from x402.mechanisms.evm.signers import (
    EthAccountSigner,
    EthAccountSignerWithRPC,
    FacilitatorWeb3Signer,
)


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


class TestEthAccountSignerWithRPC:
    """Test EthAccountSignerWithRPC client-side signer with RPC capabilities."""

    def test_should_create_signer_and_inherit_address(self):
        """Should create signer and inherit address from EthAccountSigner."""
        account = Account.create()
        signer = EthAccountSignerWithRPC(account, rpc_url="https://sepolia.base.org")

        assert signer.address == account.address
        assert signer.address.startswith("0x")
        assert len(signer.address) == 42

    def test_should_be_subclass_of_eth_account_signer(self):
        """EthAccountSignerWithRPC should inherit from EthAccountSigner."""
        account = Account.create()
        signer = EthAccountSignerWithRPC(account, rpc_url="https://sepolia.base.org")

        assert isinstance(signer, EthAccountSigner)

    def test_should_construct_web3_with_rpc_url(self):
        """Constructor should wire a Web3 client at the given RPC URL."""
        account = Account.create()
        with patch("x402.mechanisms.evm.signers.Web3") as mock_web3_cls:
            mock_provider = MagicMock()
            mock_web3_cls.HTTPProvider.return_value = mock_provider

            EthAccountSignerWithRPC(account, rpc_url="https://example.test/rpc")

            mock_web3_cls.HTTPProvider.assert_called_once_with("https://example.test/rpc")
            mock_web3_cls.assert_called_once_with(mock_provider)

    def test_should_inherit_sign_typed_data(self):
        """EthAccountSignerWithRPC should inherit working sign_typed_data."""
        account = Account.create()
        signer = EthAccountSignerWithRPC(account, rpc_url="https://sepolia.base.org")

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

        assert isinstance(signature, bytes)
        assert len(signature) >= 65

    def test_read_contract_should_call_function_and_return_value(self):
        """read_contract should checksum the address and return the call() value."""
        account = Account.create()
        signer = EthAccountSignerWithRPC(account, rpc_url="https://sepolia.base.org")

        mock_call = MagicMock(return_value=42)
        mock_function = MagicMock(return_value=MagicMock(call=mock_call))
        mock_contract = MagicMock()
        mock_contract.functions.balanceOf = mock_function
        signer._w3 = MagicMock()
        signer._w3.eth.contract.return_value = mock_contract

        # Lowercase address — read_contract must checksum it before contract().
        result = signer.read_contract(
            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
            [{"name": "balanceOf"}],
            "balanceOf",
            "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        )

        assert result == 42
        contract_call_kwargs = signer._w3.eth.contract.call_args.kwargs
        assert contract_call_kwargs["address"] == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        assert contract_call_kwargs["abi"] == [{"name": "balanceOf"}]
        mock_function.assert_called_once_with("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")
        mock_call.assert_called_once_with()

    def test_sign_transaction_should_return_hex_prefixed_raw_tx(self):
        """sign_transaction should return '0x'-prefixed hex of raw_transaction bytes."""
        account = Account.create()
        signer = EthAccountSignerWithRPC(account, rpc_url="https://sepolia.base.org")

        raw_bytes = b"\x02\xf8\x6c\x01\x80"
        signed_tx = MagicMock()
        signed_tx.raw_transaction = raw_bytes
        signer._w3 = MagicMock()
        signer._w3.eth.account.sign_transaction.return_value = signed_tx

        tx = {
            "to": "0x1234567890123456789012345678901234567890",
            "data": "0x",
            "nonce": 0,
            "gas": 21000,
            "maxFeePerGas": 2_000_000_000,
            "maxPriorityFeePerGas": 1_000_000_000,
            "chainId": 84532,
        }

        result = signer.sign_transaction(tx)

        assert result == "0x" + raw_bytes.hex()
        assert result.startswith("0x")
        signer._w3.eth.account.sign_transaction.assert_called_once_with(tx, account.key)

    def test_get_transaction_count_should_checksum_address(self):
        """get_transaction_count should pass a checksummed address to web3."""
        account = Account.create()
        signer = EthAccountSignerWithRPC(account, rpc_url="https://sepolia.base.org")

        signer._w3 = MagicMock()
        signer._w3.eth.get_transaction_count.return_value = 7

        result = signer.get_transaction_count("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")

        assert result == 7
        signer._w3.eth.get_transaction_count.assert_called_once_with(
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        )

    def test_estimate_fees_per_gas_should_compute_eip1559_fees(self):
        """estimate_fees_per_gas should return (base*2 + priority, priority)."""
        account = Account.create()
        signer = EthAccountSignerWithRPC(account, rpc_url="https://sepolia.base.org")

        signer._w3 = MagicMock()
        signer._w3.eth.get_block.return_value = {"baseFeePerGas": 5_000_000_000}
        signer._w3.eth.max_priority_fee = 1_000_000_000

        max_fee, max_priority = signer.estimate_fees_per_gas()

        assert max_priority == 1_000_000_000
        assert max_fee == 5_000_000_000 * 2 + 1_000_000_000
        signer._w3.eth.get_block.assert_called_once_with("latest")

    def test_estimate_fees_per_gas_should_default_base_fee_when_missing(self):
        """estimate_fees_per_gas should fall back to 1 gwei base when block omits it."""
        account = Account.create()
        signer = EthAccountSignerWithRPC(account, rpc_url="https://sepolia.base.org")

        signer._w3 = MagicMock()
        # Block without baseFeePerGas (e.g., legacy / non-EIP-1559 chain).
        signer._w3.eth.get_block.return_value = {}
        signer._w3.eth.max_priority_fee = 2_500_000_000

        max_fee, max_priority = signer.estimate_fees_per_gas()

        assert max_priority == 2_500_000_000
        assert max_fee == 1_000_000_000 * 2 + 2_500_000_000

    def test_implements_client_evm_signer_protocol(self):
        """EthAccountSignerWithRPC should expose RPC-extended client signer surface."""
        account = Account.create()
        signer = EthAccountSignerWithRPC(account, rpc_url="https://sepolia.base.org")

        # Inherited from EthAccountSigner:
        assert hasattr(signer, "address")
        assert hasattr(signer, "sign_typed_data")
        # Added by EthAccountSignerWithRPC for gas-sponsoring extensions:
        assert callable(signer.read_contract)
        assert callable(signer.sign_transaction)
        assert callable(signer.get_transaction_count)
        assert callable(signer.estimate_fees_per_gas)
