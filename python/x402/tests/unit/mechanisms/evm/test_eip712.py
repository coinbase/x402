"""Unit tests for x402.mechanisms.evm.eip712 and erc6492 modules.

Tests cover:
  eip712.py: _encode_type, _type_hash, _encode_data, hash_struct, hash_domain,
             hash_typed_data, hash_eip3009_authorization, build_typed_data_for_signing
  erc6492.py: is_erc6492_signature, parse_erc6492_signature, is_eoa_signature,
              has_deployment_info
"""

import pytest

from x402.mechanisms.evm.constants import ERC6492_MAGIC_VALUE
from x402.mechanisms.evm.eip712 import (
    _encode_data,
    _encode_type,
    _type_hash,
    build_typed_data_for_signing,
    hash_domain,
    hash_eip3009_authorization,
    hash_struct,
    hash_typed_data,
)
from x402.mechanisms.evm.erc6492 import (
    has_deployment_info,
    is_eoa_signature,
    is_erc6492_signature,
    parse_erc6492_signature,
)
from x402.mechanisms.evm.types import (
    AUTHORIZATION_TYPES,
    DOMAIN_TYPES,
    ERC6492SignatureData,
    ExactEIP3009Authorization,
    TypedDataDomain,
)

# ---------------------------------------------------------------------------
# Shared fixtures / constants
# ---------------------------------------------------------------------------

ZERO_ADDRESS = "0x" + "0" * 40
TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
FROM_ADDRESS = "0x1234567890123456789012345678901234567890"
TO_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
NONCE_HEX = "0x" + "aa" * 32
CHAIN_ID = 8453


@pytest.fixture()
def sample_domain() -> TypedDataDomain:
    return TypedDataDomain(
        name="USD Coin",
        version="2",
        chain_id=CHAIN_ID,
        verifying_contract=TOKEN_ADDRESS,
    )


@pytest.fixture()
def sample_authorization() -> ExactEIP3009Authorization:
    return ExactEIP3009Authorization(
        from_address=FROM_ADDRESS,
        to=TO_ADDRESS,
        value="1000000",
        valid_after="0",
        valid_before="9999999999",
        nonce=NONCE_HEX,
    )


# ===========================================================================
# Tests for eip712._encode_type
# ===========================================================================


class TestEncodeType:
    def test_encode_type_known(self):
        result = _encode_type("EIP712Domain", DOMAIN_TYPES)
        assert result == "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"

    def test_encode_type_authorization(self):
        result = _encode_type("TransferWithAuthorization", AUTHORIZATION_TYPES)
        assert result == (
            "TransferWithAuthorization("
            "address from,address to,uint256 value,"
            "uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        )

    def test_encode_type_unknown_returns_empty(self):
        result = _encode_type("NonExistentType", AUTHORIZATION_TYPES)
        assert result == ""

    def test_encode_type_single_field(self):
        single = {"MyType": [{"name": "value", "type": "uint256"}]}
        result = _encode_type("MyType", single)
        assert result == "MyType(uint256 value)"


# ===========================================================================
# Tests for eip712._type_hash
# ===========================================================================


class TestTypeHash:
    def test_type_hash_returns_bytes32(self):
        result = _type_hash("EIP712Domain", DOMAIN_TYPES)
        assert isinstance(result, bytes)
        assert len(result) == 32

    def test_type_hash_deterministic(self):
        h1 = _type_hash("TransferWithAuthorization", AUTHORIZATION_TYPES)
        h2 = _type_hash("TransferWithAuthorization", AUTHORIZATION_TYPES)
        assert h1 == h2

    def test_type_hash_different_types_differ(self):
        h_domain = _type_hash("EIP712Domain", DOMAIN_TYPES)
        all_types = {**DOMAIN_TYPES, **AUTHORIZATION_TYPES}
        h_auth = _type_hash("TransferWithAuthorization", all_types)
        assert h_domain != h_auth


# ===========================================================================
# Tests for eip712._encode_data
# ===========================================================================


class TestEncodeData:
    def test_encode_data_returns_bytes(self, sample_domain):
        data = {
            "name": sample_domain.name,
            "version": sample_domain.version,
            "chainId": sample_domain.chain_id,
            "verifyingContract": sample_domain.verifying_contract,
        }
        result = _encode_data("EIP712Domain", DOMAIN_TYPES, data)
        assert isinstance(result, bytes)

    def test_encode_data_unknown_type_raises(self):
        with pytest.raises(ValueError, match="Unknown type"):
            _encode_data("Nonexistent", DOMAIN_TYPES, {})

    def test_encode_data_missing_field_raises(self, sample_domain):
        # Missing 'version' field
        data = {
            "name": sample_domain.name,
            "chainId": sample_domain.chain_id,
            "verifyingContract": sample_domain.verifying_contract,
        }
        with pytest.raises(ValueError, match="Missing field"):
            _encode_data("EIP712Domain", DOMAIN_TYPES, data)

    def test_encode_data_unsupported_type_raises(self):
        custom = {"CustomType": [{"name": "val", "type": "tuple"}]}
        with pytest.raises(ValueError, match="Unsupported field type"):
            _encode_data("CustomType", custom, {"val": {}})

    def test_encode_data_bytes_field_as_hex(self):
        auth_types = {
            "TestAuth": [
                {"name": "nonce", "type": "bytes32"},
            ]
        }
        data = {"nonce": "0x" + "bb" * 32}
        result = _encode_data("TestAuth", auth_types, data)
        assert isinstance(result, bytes)

    def test_encode_data_bool_field(self):
        bool_type = {"BoolType": [{"name": "flag", "type": "bool"}]}
        result = _encode_data("BoolType", bool_type, {"flag": True})
        assert isinstance(result, bytes)

    def test_encode_data_int_field(self):
        int_type = {"IntType": [{"name": "amount", "type": "int256"}]}
        result = _encode_data("IntType", int_type, {"amount": -100})
        assert isinstance(result, bytes)


# ===========================================================================
# Tests for eip712.hash_struct
# ===========================================================================


class TestHashStruct:
    def test_hash_struct_returns_32_bytes(self, sample_domain):
        data = {
            "name": sample_domain.name,
            "version": sample_domain.version,
            "chainId": sample_domain.chain_id,
            "verifyingContract": sample_domain.verifying_contract,
        }
        result = hash_struct("EIP712Domain", DOMAIN_TYPES, data)
        assert isinstance(result, bytes)
        assert len(result) == 32

    def test_hash_struct_deterministic(self, sample_domain):
        data = {
            "name": sample_domain.name,
            "version": sample_domain.version,
            "chainId": sample_domain.chain_id,
            "verifyingContract": sample_domain.verifying_contract,
        }
        h1 = hash_struct("EIP712Domain", DOMAIN_TYPES, data)
        h2 = hash_struct("EIP712Domain", DOMAIN_TYPES, data)
        assert h1 == h2

    def test_hash_struct_different_data_differs(self):
        data1 = {
            "name": "TokenA",
            "version": "1",
            "chainId": 1,
            "verifyingContract": ZERO_ADDRESS,
        }
        data2 = {
            "name": "TokenB",
            "version": "1",
            "chainId": 1,
            "verifyingContract": ZERO_ADDRESS,
        }
        h1 = hash_struct("EIP712Domain", DOMAIN_TYPES, data1)
        h2 = hash_struct("EIP712Domain", DOMAIN_TYPES, data2)
        assert h1 != h2


# ===========================================================================
# Tests for eip712.hash_domain
# ===========================================================================


class TestHashDomain:
    def test_hash_domain_returns_32_bytes(self, sample_domain):
        result = hash_domain(sample_domain)
        assert isinstance(result, bytes)
        assert len(result) == 32

    def test_hash_domain_deterministic(self, sample_domain):
        h1 = hash_domain(sample_domain)
        h2 = hash_domain(sample_domain)
        assert h1 == h2

    def test_hash_domain_differs_by_chain(self, sample_domain):
        domain2 = TypedDataDomain(
            name=sample_domain.name,
            version=sample_domain.version,
            chain_id=1,  # different chain
            verifying_contract=sample_domain.verifying_contract,
        )
        h1 = hash_domain(sample_domain)
        h2 = hash_domain(domain2)
        assert h1 != h2

    def test_hash_domain_differs_by_name(self, sample_domain):
        domain2 = TypedDataDomain(
            name="Different Token",
            version=sample_domain.version,
            chain_id=sample_domain.chain_id,
            verifying_contract=sample_domain.verifying_contract,
        )
        assert hash_domain(sample_domain) != hash_domain(domain2)

    def test_hash_domain_differs_by_contract(self, sample_domain):
        domain2 = TypedDataDomain(
            name=sample_domain.name,
            version=sample_domain.version,
            chain_id=sample_domain.chain_id,
            verifying_contract=ZERO_ADDRESS,
        )
        assert hash_domain(sample_domain) != hash_domain(domain2)


# ===========================================================================
# Tests for eip712.hash_typed_data
# ===========================================================================


class TestHashTypedData:
    def test_hash_typed_data_returns_32_bytes(self, sample_domain, sample_authorization):
        message = {
            "from": sample_authorization.from_address,
            "to": sample_authorization.to,
            "value": int(sample_authorization.value),
            "validAfter": int(sample_authorization.valid_after),
            "validBefore": int(sample_authorization.valid_before),
            "nonce": bytes.fromhex(sample_authorization.nonce.removeprefix("0x")),
        }
        result = hash_typed_data(
            sample_domain,
            AUTHORIZATION_TYPES,
            "TransferWithAuthorization",
            message,
        )
        assert isinstance(result, bytes)
        assert len(result) == 32

    def test_hash_typed_data_deterministic(self, sample_domain, sample_authorization):
        message = {
            "from": sample_authorization.from_address,
            "to": sample_authorization.to,
            "value": int(sample_authorization.value),
            "validAfter": int(sample_authorization.valid_after),
            "validBefore": int(sample_authorization.valid_before),
            "nonce": bytes.fromhex(sample_authorization.nonce.removeprefix("0x")),
        }
        h1 = hash_typed_data(
            sample_domain, AUTHORIZATION_TYPES, "TransferWithAuthorization", message
        )
        h2 = hash_typed_data(
            sample_domain, AUTHORIZATION_TYPES, "TransferWithAuthorization", message
        )
        assert h1 == h2

    def test_hash_typed_data_differs_by_domain(self, sample_authorization):
        domain_a = TypedDataDomain(
            name="USD Coin", version="2", chain_id=1, verifying_contract=TOKEN_ADDRESS
        )
        domain_b = TypedDataDomain(
            name="USD Coin", version="2", chain_id=137, verifying_contract=TOKEN_ADDRESS
        )
        message = {
            "from": sample_authorization.from_address,
            "to": sample_authorization.to,
            "value": int(sample_authorization.value),
            "validAfter": 0,
            "validBefore": 9999999999,
            "nonce": bytes.fromhex(sample_authorization.nonce.removeprefix("0x")),
        }
        h1 = hash_typed_data(
            domain_a, AUTHORIZATION_TYPES, "TransferWithAuthorization", message
        )
        h2 = hash_typed_data(
            domain_b, AUTHORIZATION_TYPES, "TransferWithAuthorization", message
        )
        assert h1 != h2

    def test_hash_typed_data_differs_by_amount(self, sample_domain, sample_authorization):
        make_msg = lambda amount: {
            "from": sample_authorization.from_address,
            "to": sample_authorization.to,
            "value": amount,
            "validAfter": 0,
            "validBefore": 9999999999,
            "nonce": bytes.fromhex(sample_authorization.nonce.removeprefix("0x")),
        }
        h1 = hash_typed_data(
            sample_domain, AUTHORIZATION_TYPES, "TransferWithAuthorization", make_msg(1000000)
        )
        h2 = hash_typed_data(
            sample_domain, AUTHORIZATION_TYPES, "TransferWithAuthorization", make_msg(2000000)
        )
        assert h1 != h2


# ===========================================================================
# Tests for eip712.hash_eip3009_authorization
# ===========================================================================


class TestHashEip3009Authorization:
    def test_returns_32_bytes(self, sample_authorization):
        result = hash_eip3009_authorization(
            authorization=sample_authorization,
            chain_id=CHAIN_ID,
            verifying_contract=TOKEN_ADDRESS,
            token_name="USD Coin",
            token_version="2",
        )
        assert isinstance(result, bytes)
        assert len(result) == 32

    def test_deterministic(self, sample_authorization):
        kwargs = dict(
            authorization=sample_authorization,
            chain_id=CHAIN_ID,
            verifying_contract=TOKEN_ADDRESS,
            token_name="USD Coin",
            token_version="2",
        )
        assert hash_eip3009_authorization(**kwargs) == hash_eip3009_authorization(**kwargs)

    def test_differs_by_amount(self, sample_authorization):
        auth2 = ExactEIP3009Authorization(
            from_address=sample_authorization.from_address,
            to=sample_authorization.to,
            value="2000000",  # different
            valid_after=sample_authorization.valid_after,
            valid_before=sample_authorization.valid_before,
            nonce=sample_authorization.nonce,
        )
        h1 = hash_eip3009_authorization(
            sample_authorization, CHAIN_ID, TOKEN_ADDRESS, "USD Coin", "2"
        )
        h2 = hash_eip3009_authorization(auth2, CHAIN_ID, TOKEN_ADDRESS, "USD Coin", "2")
        assert h1 != h2

    def test_differs_by_chain(self, sample_authorization):
        h1 = hash_eip3009_authorization(
            sample_authorization, CHAIN_ID, TOKEN_ADDRESS, "USD Coin", "2"
        )
        h2 = hash_eip3009_authorization(
            sample_authorization, 1, TOKEN_ADDRESS, "USD Coin", "2"
        )
        assert h1 != h2

    def test_differs_by_token_name(self, sample_authorization):
        h1 = hash_eip3009_authorization(
            sample_authorization, CHAIN_ID, TOKEN_ADDRESS, "USD Coin", "2"
        )
        h2 = hash_eip3009_authorization(
            sample_authorization, CHAIN_ID, TOKEN_ADDRESS, "USDC", "2"
        )
        assert h1 != h2


# ===========================================================================
# Tests for eip712.build_typed_data_for_signing
# ===========================================================================


class TestBuildTypedDataForSigning:
    def test_returns_four_tuple(self, sample_authorization):
        result = build_typed_data_for_signing(
            authorization=sample_authorization,
            chain_id=CHAIN_ID,
            verifying_contract=TOKEN_ADDRESS,
            token_name="USD Coin",
            token_version="2",
        )
        assert len(result) == 4

    def test_primary_type_is_transfer_with_authorization(self, sample_authorization):
        _, _, primary_type, _ = build_typed_data_for_signing(
            authorization=sample_authorization,
            chain_id=CHAIN_ID,
            verifying_contract=TOKEN_ADDRESS,
            token_name="USD Coin",
            token_version="2",
        )
        assert primary_type == "TransferWithAuthorization"

    def test_domain_has_correct_chain_id(self, sample_authorization):
        domain, _, _, _ = build_typed_data_for_signing(
            authorization=sample_authorization,
            chain_id=CHAIN_ID,
            verifying_contract=TOKEN_ADDRESS,
            token_name="USD Coin",
            token_version="2",
        )
        assert domain.chain_id == CHAIN_ID

    def test_message_contains_authorization_fields(self, sample_authorization):
        _, _, _, message = build_typed_data_for_signing(
            authorization=sample_authorization,
            chain_id=CHAIN_ID,
            verifying_contract=TOKEN_ADDRESS,
            token_name="USD Coin",
            token_version="2",
        )
        assert "from" in message
        assert "to" in message
        assert "value" in message
        assert "validAfter" in message
        assert "validBefore" in message
        assert "nonce" in message

    def test_message_from_matches_authorization(self, sample_authorization):
        _, _, _, message = build_typed_data_for_signing(
            authorization=sample_authorization,
            chain_id=CHAIN_ID,
            verifying_contract=TOKEN_ADDRESS,
            token_name="USD Coin",
            token_version="2",
        )
        assert message["from"] == sample_authorization.from_address

    def test_hash_consistent_with_hash_eip3009(self, sample_authorization):
        """hash_typed_data on the returned components == hash_eip3009_authorization."""
        domain, types, primary_type, message = build_typed_data_for_signing(
            authorization=sample_authorization,
            chain_id=CHAIN_ID,
            verifying_contract=TOKEN_ADDRESS,
            token_name="USD Coin",
            token_version="2",
        )
        h_components = hash_typed_data(domain, types, primary_type, message)
        h_direct = hash_eip3009_authorization(
            sample_authorization, CHAIN_ID, TOKEN_ADDRESS, "USD Coin", "2"
        )
        assert h_components == h_direct


# ===========================================================================
# Tests for erc6492.is_erc6492_signature
# ===========================================================================


class TestIsErc6492Signature:
    def test_signature_shorter_than_32_bytes_is_false(self):
        assert is_erc6492_signature(b"\x00" * 31) is False

    def test_empty_signature_is_false(self):
        assert is_erc6492_signature(b"") is False

    def test_regular_65_byte_sig_is_false(self):
        sig = b"\x01" * 65
        assert is_erc6492_signature(sig) is False

    def test_signature_ending_with_magic_value_is_true(self):
        payload = b"\xab" * 96  # arbitrary ABI-encoded content
        sig = payload + ERC6492_MAGIC_VALUE
        assert is_erc6492_signature(sig) is True

    def test_magic_value_alone_is_true(self):
        # Exactly 32 bytes = just the magic value
        assert is_erc6492_signature(ERC6492_MAGIC_VALUE) is True

    def test_wrong_magic_suffix_is_false(self):
        sig = b"\xaa" * 128 + b"\x00" * 32
        assert is_erc6492_signature(sig) is False


# ===========================================================================
# Tests for erc6492.parse_erc6492_signature
# ===========================================================================


class TestParseErc6492Signature:
    def test_non_erc6492_returns_original_as_inner(self):
        raw = b"\x01" * 65
        result = parse_erc6492_signature(raw)
        assert result.inner_signature == raw
        assert result.factory == bytes(20)
        assert result.factory_calldata == b""

    def test_valid_erc6492_parses_correctly(self):
        from eth_abi import encode

        factory_addr = "0x" + "ca" * 20
        calldata = b"\xde\xad\xbe\xef"
        inner_sig = b"\x01" * 65

        # Encode as per ERC-6492 spec: (address, bytes, bytes) + magic
        payload = encode(["address", "bytes", "bytes"], [factory_addr, calldata, inner_sig])
        sig = payload + ERC6492_MAGIC_VALUE

        result = parse_erc6492_signature(sig)
        assert result.inner_signature == inner_sig
        assert result.factory_calldata == calldata

    def test_invalid_erc6492_abi_raises_value_error(self):
        # Magic suffix but corrupted ABI payload
        bad_payload = b"\xff" * 10  # too short to be valid ABI
        sig = bad_payload + ERC6492_MAGIC_VALUE
        with pytest.raises(ValueError, match="Invalid ERC-6492 signature format"):
            parse_erc6492_signature(sig)

    def test_non_erc6492_does_not_raise(self):
        raw = bytes(65)
        result = parse_erc6492_signature(raw)
        assert isinstance(result, ERC6492SignatureData)


# ===========================================================================
# Tests for erc6492.is_eoa_signature
# ===========================================================================


class TestIsEoaSignature:
    def test_65_byte_sig_with_zero_factory_is_eoa(self):
        sig_data = ERC6492SignatureData(
            factory=bytes(20),
            factory_calldata=b"",
            inner_signature=b"\x01" * 65,
        )
        assert is_eoa_signature(sig_data) is True

    def test_non_65_byte_sig_is_not_eoa(self):
        sig_data = ERC6492SignatureData(
            factory=bytes(20),
            factory_calldata=b"",
            inner_signature=b"\x01" * 64,
        )
        assert is_eoa_signature(sig_data) is False

    def test_non_zero_factory_is_not_eoa(self):
        sig_data = ERC6492SignatureData(
            factory=bytes([0xCA] * 20),
            factory_calldata=b"\xde\xad",
            inner_signature=b"\x01" * 65,
        )
        assert is_eoa_signature(sig_data) is False

    def test_empty_inner_is_not_eoa(self):
        sig_data = ERC6492SignatureData(
            factory=bytes(20),
            factory_calldata=b"",
            inner_signature=b"",
        )
        assert is_eoa_signature(sig_data) is False


# ===========================================================================
# Tests for erc6492.has_deployment_info
# ===========================================================================


class TestHasDeploymentInfo:
    def test_non_zero_factory_with_calldata_has_info(self):
        sig_data = ERC6492SignatureData(
            factory=bytes([0xCA] * 20),
            factory_calldata=b"\xde\xad\xbe\xef",
            inner_signature=b"\x01" * 65,
        )
        assert has_deployment_info(sig_data) is True

    def test_zero_factory_no_calldata_has_no_info(self):
        sig_data = ERC6492SignatureData(
            factory=bytes(20),
            factory_calldata=b"",
            inner_signature=b"\x01" * 65,
        )
        assert has_deployment_info(sig_data) is False

    def test_non_zero_factory_empty_calldata_has_no_info(self):
        # Factory set but no calldata -> not considered a deployment
        sig_data = ERC6492SignatureData(
            factory=bytes([0xCA] * 20),
            factory_calldata=b"",
            inner_signature=b"\x01" * 65,
        )
        assert has_deployment_info(sig_data) is False

    def test_zero_factory_with_calldata_has_no_info(self):
        # Calldata present but factory is zero -> not a deployment
        sig_data = ERC6492SignatureData(
            factory=bytes(20),
            factory_calldata=b"\xde\xad",
            inner_signature=b"\x01" * 65,
        )
        assert has_deployment_info(sig_data) is False
