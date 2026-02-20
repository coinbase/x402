"""Tests for universal signature verification with ERC-6492 validator checks."""

import pytest

try:
    from eth_abi import encode as eth_abi_encode
except ImportError:
    pytest.skip("eth-abi not available", allow_module_level=True)

from x402.mechanisms.evm.verify import verify_erc6492_signature, verify_universal_signature

# ERC-6492 magic bytes suffix
ERC6492_MAGIC = bytes.fromhex(
    "6492649264926492649264926492649264926492649264926492649264926492"
)


def make_erc6492_sig(factory: bytes, calldata: bytes, inner_sig: bytes) -> bytes:
    """Build a valid ERC-6492 wrapped signature for testing.

    Format: abi.encode(address, bytes, bytes) + magic
    """
    encoded = eth_abi_encode(["address", "bytes", "bytes"], [factory, calldata, inner_sig])
    return encoded + ERC6492_MAGIC


FACTORY_ADDR = bytes.fromhex("1111111111111111111111111111111111111111")
FACTORY_CALLDATA = bytes.fromhex("deadbeef")
GARBAGE_INNER_SIG = b"\x00" * 65  # All-zero 65-byte "signature" — forged/invalid
WALLET_ADDRESS = "0x1234567890123456789012345678901234567890"
TEST_HASH = b"\x01" * 32


class MockFacilitatorSigner:
    """Minimal mock facilitator signer for verify tests."""

    def __init__(self, read_contract_result=None, read_contract_raises=None, code=b""):
        self._read_contract_result = read_contract_result
        self._read_contract_raises = read_contract_raises
        self._code = code

    def get_code(self, address: str) -> bytes:
        return self._code

    def read_contract(self, address, abi, function_name, *args):
        if self._read_contract_raises is not None:
            raise self._read_contract_raises
        return self._read_contract_result


class TestVerifyUniversalSignatureERC6492ValidatorChecks:
    """Tests that ERC-6492 signatures go through the UniversalSigValidator."""

    def test_forged_erc6492_validator_returns_false(self):
        """Forged ERC-6492 (garbage inner sig) must be rejected when validator returns False."""
        erc6492_sig = make_erc6492_sig(FACTORY_ADDR, FACTORY_CALLDATA, GARBAGE_INNER_SIG)
        signer = MockFacilitatorSigner(
            read_contract_result=False,  # Validator rejects the signature
            code=b"",  # Undeployed
        )

        valid, sig_data = verify_universal_signature(
            signer,
            WALLET_ADDRESS,
            TEST_HASH,
            erc6492_sig,
            allow_undeployed=True,
        )

        assert valid is False, "Forged ERC-6492 signature should be rejected"

    def test_valid_erc6492_validator_returns_true(self):
        """Valid ERC-6492 must be accepted when validator returns True."""
        erc6492_sig = make_erc6492_sig(FACTORY_ADDR, FACTORY_CALLDATA, GARBAGE_INNER_SIG)
        signer = MockFacilitatorSigner(
            read_contract_result=True,  # Validator accepts the signature
            code=b"",  # Undeployed
        )

        valid, sig_data = verify_universal_signature(
            signer,
            WALLET_ADDRESS,
            TEST_HASH,
            erc6492_sig,
            allow_undeployed=True,
        )

        assert valid is True, "Valid ERC-6492 signature should be accepted"

    def test_validator_unavailable_returns_false(self):
        """Signature must be rejected (not errored) when validator contract call fails."""
        erc6492_sig = make_erc6492_sig(FACTORY_ADDR, FACTORY_CALLDATA, GARBAGE_INNER_SIG)
        signer = MockFacilitatorSigner(
            read_contract_raises=Exception("contract not deployed"),
            code=b"",  # Undeployed
        )

        valid, sig_data = verify_universal_signature(
            signer,
            WALLET_ADDRESS,
            TEST_HASH,
            erc6492_sig,
            allow_undeployed=True,
        )

        assert valid is False, "Should reject when UniversalSigValidator is unavailable"

    def test_allow_undeployed_false_raises(self):
        """Should raise ValueError when allow_undeployed=False and wallet is undeployed."""
        erc6492_sig = make_erc6492_sig(FACTORY_ADDR, FACTORY_CALLDATA, GARBAGE_INNER_SIG)
        signer = MockFacilitatorSigner(
            read_contract_result=True,
            code=b"",  # Undeployed
        )

        with pytest.raises(ValueError, match="not allowed"):
            verify_universal_signature(
                signer,
                WALLET_ADDRESS,
                TEST_HASH,
                erc6492_sig,
                allow_undeployed=False,
            )


class TestVerifyERC6492Signature:
    """Unit tests for verify_erc6492_signature directly."""

    def test_returns_true_when_validator_returns_true(self):
        signer = MockFacilitatorSigner(read_contract_result=True)
        result = verify_erc6492_signature(signer, WALLET_ADDRESS, TEST_HASH, GARBAGE_INNER_SIG)
        assert result is True

    def test_returns_false_when_validator_returns_false(self):
        signer = MockFacilitatorSigner(read_contract_result=False)
        result = verify_erc6492_signature(signer, WALLET_ADDRESS, TEST_HASH, GARBAGE_INNER_SIG)
        assert result is False

    def test_returns_false_when_validator_raises(self):
        signer = MockFacilitatorSigner(read_contract_raises=Exception("network error"))
        result = verify_erc6492_signature(signer, WALLET_ADDRESS, TEST_HASH, GARBAGE_INNER_SIG)
        assert result is False

    def test_returns_false_when_validator_returns_non_bool(self):
        signer = MockFacilitatorSigner(read_contract_result="not a bool")
        result = verify_erc6492_signature(signer, WALLET_ADDRESS, TEST_HASH, GARBAGE_INNER_SIG)
        assert result is False
