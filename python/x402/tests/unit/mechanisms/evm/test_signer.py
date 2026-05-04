"""Tests for EVM signer implementations."""

from unittest.mock import MagicMock, patch

import pytest

try:
    from eth_account import Account
except ImportError:
    pytest.skip("EVM signers require eth_account", allow_module_level=True)

from x402.mechanisms.evm.signers import EthAccountSigner, FacilitatorWeb3Signer


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


class TestFacilitatorWeb3SignerMethods:
    """Test FacilitatorWeb3Signer functional methods with mocked Web3."""

    def _make_signer(self) -> FacilitatorWeb3Signer:
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
        )
        signer._w3 = MagicMock()
        return signer

    def test_get_chain_id_should_query_web3_and_cache_result(self):
        """First call should hit RPC; subsequent calls should reuse the cached value."""
        signer = self._make_signer()
        # Use PropertyMock-style attribute on the mock
        signer._w3.eth.chain_id = 8453

        first = signer.get_chain_id()
        # Mutate underlying value to prove caching: second call should still return 8453
        signer._w3.eth.chain_id = 1
        second = signer.get_chain_id()

        assert first == 8453
        assert second == 8453

    def test_read_contract_should_checksum_address_and_call_function(self):
        """read_contract should checksum the address, invoke the function, and pass {'from': self.address}."""
        signer = self._make_signer()

        mock_call = MagicMock(return_value=42)
        mock_function = MagicMock(return_value=MagicMock(call=mock_call))
        mock_contract = MagicMock()
        mock_contract.functions.balanceOf = mock_function
        signer._w3.eth.contract.return_value = mock_contract

        result = signer.read_contract(
            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
            [{"name": "balanceOf"}],
            "balanceOf",
            "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        )

        assert result == 42
        call_kwargs = signer._w3.eth.contract.call_args.kwargs
        assert call_kwargs["address"] == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        assert call_kwargs["abi"] == [{"name": "balanceOf"}]
        mock_function.assert_called_once_with("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")
        # call() should receive {"from": <signer address>}
        from_arg = mock_call.call_args.args[0]
        assert from_arg["from"] == signer.address

    def test_verify_typed_data_should_return_true_for_matching_eoa_signature(self):
        """An EOA signature signed by the same key should verify as True."""
        # Use a real account so we can produce a real signature
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
        )
        signer._w3 = MagicMock()

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

        # Sign with the underlying account using the same logic as EthAccountSigner
        client_signer = EthAccountSigner(account)
        signature = client_signer.sign_typed_data(
            domain, types, "TransferWithAuthorization", message
        )

        result = signer.verify_typed_data(
            account.address, domain, types, "TransferWithAuthorization", message, signature
        )

        assert result is True

    def test_verify_typed_data_should_return_false_for_wrong_address_eoa_no_code(self):
        """A valid signature from address A but checked against address B (an EOA) should return False."""
        signer_a = Account.create()
        signer_b = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=signer_a.key.hex(),
            rpc_url="https://sepolia.base.org",
        )
        signer._w3 = MagicMock()
        # B is an EOA (no code) -> EIP-1271 path is skipped
        signer._w3.eth.get_code.return_value = b""

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
            "from": signer_a.address,
            "to": "0x1234567890123456789012345678901234567890",
            "value": "1000000",
            "validAfter": "1000000000",
            "validBefore": "1000003600",
            "nonce": "0x" + "00" * 32,
        }

        signature = EthAccountSigner(signer_a).sign_typed_data(
            domain, types, "TransferWithAuthorization", message
        )

        # Signed by A, but we ask whether it matches B
        result = signer.verify_typed_data(
            signer_b.address, domain, types, "TransferWithAuthorization", message, signature
        )

        assert result is False

    def test_verify_typed_data_should_normalize_bytes_nonce(self):
        """A bytes nonce in the message should be normalized to hex string and still verify."""
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
        )
        signer._w3 = MagicMock()

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
        # First sign with hex string nonce
        message_hex = {
            "from": account.address,
            "to": "0x1234567890123456789012345678901234567890",
            "value": "1000000",
            "validAfter": "1000000000",
            "validBefore": "1000003600",
            "nonce": "0x" + "00" * 32,
        }
        signature = EthAccountSigner(account).sign_typed_data(
            domain, types, "TransferWithAuthorization", message_hex
        )

        # Now hand the verifier a bytes nonce — verify_typed_data must normalize it
        message_bytes = dict(message_hex)
        message_bytes["nonce"] = b"\x00" * 32

        result = signer.verify_typed_data(
            account.address, domain, types, "TransferWithAuthorization", message_bytes, signature
        )

        assert result is True
        # Caller's message dict should not be mutated (verify_typed_data uses .copy())
        assert message_bytes["nonce"] == b"\x00" * 32

    def test_verify_typed_data_should_return_false_on_internal_exception(self):
        """If signature recovery throws, verify_typed_data should swallow the error and return False."""
        signer = self._make_signer()

        from x402.mechanisms.evm.types import TypedDataDomain, TypedDataField

        domain = TypedDataDomain(
            name="USD Coin",
            version="2",
            chain_id=8453,
            verifying_contract="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        )
        types = {
            "Foo": [TypedDataField(name="bar", type="uint256")],
        }
        message = {"bar": "1"}

        # Empty signature bytes -> Account.recover_message will raise
        result = signer.verify_typed_data(
            "0x1234567890123456789012345678901234567890",
            domain,
            types,
            "Foo",
            message,
            b"",
        )

        assert result is False

    def test_verify_typed_data_should_accept_raw_dict_domain(self):
        """A raw dict domain (used by Permit2, no version) should be accepted as-is."""
        account = Account.create()
        signer = FacilitatorWeb3Signer(
            private_key=account.key.hex(),
            rpc_url="https://sepolia.base.org",
        )
        signer._w3 = MagicMock()

        from x402.mechanisms.evm.types import TypedDataField

        domain_dict = {
            "name": "Permit2",
            "chainId": 8453,
            "verifyingContract": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        }
        types = {
            "Foo": [
                TypedDataField(name="bar", type="uint256"),
            ],
        }
        message = {"bar": "1"}

        signature = EthAccountSigner(account).sign_typed_data(domain_dict, types, "Foo", message)

        result = signer.verify_typed_data(
            account.address, domain_dict, types, "Foo", message, signature
        )

        assert result is True

    def test_write_contract_should_build_sign_and_send_transaction(self):
        """write_contract should build the tx, sign with the signer's account, and broadcast it."""
        signer = self._make_signer()

        mock_built_tx = {
            "from": signer.address,
            "to": "0xcontract",
            "data": "0xdeadbeef",
            "nonce": 5,
            "gas": 300000,
            "gasPrice": 10,
        }
        mock_function_inst = MagicMock()
        mock_function_inst.build_transaction.return_value = mock_built_tx
        mock_function = MagicMock(return_value=mock_function_inst)
        mock_contract = MagicMock()
        mock_contract.functions.transfer = mock_function
        signer._w3.eth.contract.return_value = mock_contract
        signer._w3.eth.get_transaction_count.return_value = 5
        signer._w3.eth.gas_price = 10
        signer._w3.eth.send_raw_transaction.return_value = bytes.fromhex("ab" * 32)

        signed = MagicMock()
        signed.raw_transaction = b"\x01\x02\x03"
        with patch.object(signer._account, "sign_transaction", return_value=signed) as sign_mock:
            tx_hash = signer.write_contract(
                "0xfffefdfcfbfafff8f7f6f5f4f3f2f1f0fffefdfc",
                [{"name": "transfer"}],
                "transfer",
                "0x1234567890123456789012345678901234567890",
                1000,
            )

        # send_raw_transaction got the signed bytes
        signer._w3.eth.send_raw_transaction.assert_called_once_with(b"\x01\x02\x03")
        sign_mock.assert_called_once_with(mock_built_tx)
        mock_function.assert_called_once_with("0x1234567890123456789012345678901234567890", 1000)
        build_kwargs = mock_function_inst.build_transaction.call_args.args[0]
        assert build_kwargs["from"] == signer.address
        assert build_kwargs["nonce"] == 5
        assert build_kwargs["gas"] == 300000
        assert build_kwargs["gasPrice"] == 10
        # Contract address should have been checksummed (mixed case, same hex)
        contract_kwargs = signer._w3.eth.contract.call_args.kwargs
        assert contract_kwargs["address"].lower() == "0xfffefdfcfbfafff8f7f6f5f4f3f2f1f0fffefdfc"
        assert (
            contract_kwargs["address"] != "0xfffefdfcfbfafff8f7f6f5f4f3f2f1f0fffefdfc"
        )  # not all-lowercase
        # Returned tx hash is hex of the bytes returned by send_raw_transaction
        assert tx_hash == ("ab" * 32)

    def test_send_transaction_should_build_sign_and_send_raw(self):
        """send_transaction should construct a tx dict, sign with account, and broadcast."""
        signer = self._make_signer()

        signer._w3.eth.get_transaction_count.return_value = 3
        signer._w3.eth.gas_price = 100
        signer._w3.eth.send_raw_transaction.return_value = bytes.fromhex("cd" * 32)

        signed = MagicMock()
        signed.raw_transaction = b"\xde\xad\xbe\xef"
        with patch.object(signer._account, "sign_transaction", return_value=signed) as sign_mock:
            tx_hash = signer.send_transaction(
                "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
                b"\x12\x34",
            )

        sign_mock.assert_called_once()
        built_tx = sign_mock.call_args.args[0]
        assert built_tx["from"] == signer.address
        assert built_tx["to"].lower() == "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
        assert (
            built_tx["to"] != "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
        )  # checksummed (mixed case)
        assert built_tx["data"] == b"\x12\x34"
        assert built_tx["nonce"] == 3
        assert built_tx["gas"] == 300000
        assert built_tx["gasPrice"] == 100

        signer._w3.eth.send_raw_transaction.assert_called_once_with(b"\xde\xad\xbe\xef")
        assert tx_hash == ("cd" * 32)

    def test_wait_for_transaction_receipt_should_return_success_receipt(self):
        """wait_for_transaction_receipt should map status=1 to TX_STATUS_SUCCESS and propagate block_number."""
        signer = self._make_signer()

        signer._w3.eth.wait_for_transaction_receipt.return_value = {
            "status": 1,
            "blockNumber": 12345678,
        }

        receipt = signer.wait_for_transaction_receipt(
            "0xa1a2a3a4a5a6a7a8a9a0a1a2a3a4a5a6a7a8a9a0a1a2a3a4a5a6a7a8a9a0a1a2"
        )

        assert receipt.status == 1
        assert receipt.block_number == 12345678
        assert receipt.tx_hash.startswith("0x")

    def test_wait_for_transaction_receipt_should_map_failed_status(self):
        """status != 1 should map to status=0 (failed)."""
        signer = self._make_signer()

        signer._w3.eth.wait_for_transaction_receipt.return_value = {
            "status": 0,
            "blockNumber": 99,
        }

        receipt = signer.wait_for_transaction_receipt(
            "0xa1a2a3a4a5a6a7a8a9a0a1a2a3a4a5a6a7a8a9a0a1a2a3a4a5a6a7a8a9a0a1a2"
        )

        assert receipt.status == 0
        assert receipt.block_number == 99

    def test_wait_for_transaction_receipt_should_normalize_missing_0x_prefix(self):
        """A tx_hash without 0x prefix should be normalized before being returned in the receipt."""
        signer = self._make_signer()

        signer._w3.eth.wait_for_transaction_receipt.return_value = {
            "status": 1,
            "blockNumber": 1,
        }

        bare_hash = "a1" * 32
        receipt = signer.wait_for_transaction_receipt(bare_hash)

        # The web3 mock receives the prefixed hash
        signer._w3.eth.wait_for_transaction_receipt.assert_called_once_with(
            "0x" + bare_hash, timeout=120
        )
        assert receipt.tx_hash == "0x" + bare_hash

    def test_get_balance_should_return_native_balance_for_zero_address(self):
        """token_address == zero address should route to eth.get_balance (native)."""
        signer = self._make_signer()

        signer._w3.eth.get_balance.return_value = 1234567890

        result = signer.get_balance(
            "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
            "0x0000000000000000000000000000000000000000",
        )

        assert result == 1234567890
        signer._w3.eth.get_balance.assert_called_once()
        addr_arg = signer._w3.eth.get_balance.call_args.args[0]
        assert addr_arg.lower() == "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
        assert addr_arg != "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"  # checksummed
        # ERC20 path should not have been touched
        signer._w3.eth.contract.assert_not_called()

    def test_get_balance_should_return_native_balance_for_empty_token_address(self):
        """An empty/None token address should also route to native balance."""
        signer = self._make_signer()

        signer._w3.eth.get_balance.return_value = 7
        result = signer.get_balance(
            "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
            "",
        )

        assert result == 7
        signer._w3.eth.contract.assert_not_called()

    def test_get_balance_should_return_erc20_balance_for_token_address(self):
        """A non-zero token address should go through the ERC20 contract path."""
        signer = self._make_signer()

        mock_call = MagicMock(return_value=500)
        mock_function = MagicMock(return_value=MagicMock(call=mock_call))
        mock_contract = MagicMock()
        mock_contract.functions.balanceOf = mock_function
        signer._w3.eth.contract.return_value = mock_contract

        result = signer.get_balance(
            "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        )

        assert result == 500
        # Token contract address checksummed
        contract_kwargs = signer._w3.eth.contract.call_args.kwargs
        assert contract_kwargs["address"].lower() == "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
        assert (
            contract_kwargs["address"] != "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
        )  # checksummed
        # balanceOf called with the checksummed account address
        balance_args = mock_function.call_args.args
        assert balance_args[0].lower() == "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
        assert balance_args[0] != "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"  # checksummed
        # Native balance should not have been touched
        signer._w3.eth.get_balance.assert_not_called()

    def test_get_code_should_checksum_address_and_return_bytes(self):
        """get_code should checksum the address and wrap the result in bytes()."""
        signer = self._make_signer()

        signer._w3.eth.get_code.return_value = b"\x60\x80\x60\x40"

        result = signer.get_code("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913")

        assert isinstance(result, bytes)
        assert result == b"\x60\x80\x60\x40"
        signer._w3.eth.get_code.assert_called_once_with(
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
        )

    def test_get_code_should_return_empty_bytes_for_eoa(self):
        """An EOA returns empty bytes from web3; get_code should pass that through as bytes()."""
        signer = self._make_signer()

        signer._w3.eth.get_code.return_value = b""

        result = signer.get_code("0x1234567890123456789012345678901234567890")

        assert result == b""
        assert isinstance(result, bytes)
