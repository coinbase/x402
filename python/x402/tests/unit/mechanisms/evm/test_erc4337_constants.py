"""Tests for ERC-4337 constants."""

import re

from x402.mechanisms.evm.erc4337_constants import (
    AA_ERROR_MESSAGES,
    ENTRY_POINT_07_ADDRESS,
    FCL_P256_VERIFIER,
    P256_OWNER_FACTORY,
    SAFE_4337_MODULE_ADDRESS,
    SAFE_WEBAUTHN_SHARED_SIGNER,
    WEBAUTHN_SIGNER_FACTORY,
    ERR_GAS_ESTIMATION_FAILED,
    ERR_MISSING_BUNDLER_URL,
    ERR_MISSING_ENTRY_POINT,
    ERR_MISSING_USER_OPERATION,
    ERR_RECEIPT_TIMEOUT,
    ERR_SEND_FAILED,
)

# All contract address constants
_ADDRESS_CONSTANTS = {
    "ENTRY_POINT_07_ADDRESS": ENTRY_POINT_07_ADDRESS,
    "SAFE_4337_MODULE_ADDRESS": SAFE_4337_MODULE_ADDRESS,
    "SAFE_WEBAUTHN_SHARED_SIGNER": SAFE_WEBAUTHN_SHARED_SIGNER,
    "FCL_P256_VERIFIER": FCL_P256_VERIFIER,
    "P256_OWNER_FACTORY": P256_OWNER_FACTORY,
    "WEBAUTHN_SIGNER_FACTORY": WEBAUTHN_SIGNER_FACTORY,
}

# Expected AA error codes
_EXPECTED_AA_CODES = [
    "AA10", "AA13", "AA14", "AA15",
    "AA20", "AA21", "AA22", "AA23", "AA24", "AA25", "AA26",
    "AA30", "AA31", "AA32", "AA33", "AA34",
    "AA40", "AA41",
    "AA50", "AA51",
]


class TestAddressConstants:
    def test_all_addresses_are_valid_hex(self):
        """All address constants should be 42-char hex strings starting with 0x."""
        hex_pattern = re.compile(r"^0x[0-9a-fA-F]{40}$")
        for name, address in _ADDRESS_CONSTANTS.items():
            assert hex_pattern.match(address), (
                f"{name} = {address!r} is not a valid Ethereum address"
            )

    def test_entry_point_07_address(self):
        assert ENTRY_POINT_07_ADDRESS == "0x0000000071727De22E5E9d8BAf0edAc6f37da032"

    def test_safe_4337_module_address(self):
        assert SAFE_4337_MODULE_ADDRESS == "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226"

    def test_safe_webauthn_shared_signer(self):
        assert SAFE_WEBAUTHN_SHARED_SIGNER == "0xfD90FAd33ee8b58f32c00aceEad1358e4AFC23f9"

    def test_fcl_p256_verifier(self):
        assert FCL_P256_VERIFIER == "0xA86e0054C51E4894D88762a017ECc5E5235f5DBA"

    def test_p256_owner_factory(self):
        assert P256_OWNER_FACTORY == "0x349c03Eb61e26528cbf79F5D3Ba071FcA2aE82cB"

    def test_webauthn_signer_factory(self):
        assert WEBAUTHN_SIGNER_FACTORY == "0xF7488fFbe67327ac9f37D5F722d83Fc900852Fbf"

    def test_address_length(self):
        """Every address constant should be exactly 42 characters."""
        for name, address in _ADDRESS_CONSTANTS.items():
            assert len(address) == 42, f"{name} has length {len(address)}, expected 42"

    def test_addresses_start_with_0x(self):
        for name, address in _ADDRESS_CONSTANTS.items():
            assert address.startswith("0x"), f"{name} does not start with 0x"


class TestAAErrorMessages:
    def test_contains_all_expected_codes(self):
        """AA_ERROR_MESSAGES should contain all expected AA codes."""
        for code in _EXPECTED_AA_CODES:
            assert code in AA_ERROR_MESSAGES, f"Missing AA error code: {code}"

    def test_all_messages_non_empty(self):
        """All AA error messages should be non-empty strings."""
        for code, message in AA_ERROR_MESSAGES.items():
            assert isinstance(message, str), f"{code} message is not a string"
            assert len(message) > 0, f"{code} has empty message"

    def test_all_codes_match_aa_pattern(self):
        """All keys in AA_ERROR_MESSAGES should match AA followed by two digits."""
        pattern = re.compile(r"^AA\d{2}$")
        for code in AA_ERROR_MESSAGES:
            assert pattern.match(code), f"{code!r} does not match AA## pattern"

    def test_no_duplicate_messages(self):
        """No two AA codes should share the same error message."""
        messages = list(AA_ERROR_MESSAGES.values())
        assert len(messages) == len(set(messages)), "Duplicate messages found in AA_ERROR_MESSAGES"

    def test_expected_count(self):
        """AA_ERROR_MESSAGES should contain exactly the expected number of codes."""
        assert len(AA_ERROR_MESSAGES) == len(_EXPECTED_AA_CODES)


class TestErrorStringConstants:
    def test_err_missing_user_operation_non_empty(self):
        assert isinstance(ERR_MISSING_USER_OPERATION, str)
        assert len(ERR_MISSING_USER_OPERATION) > 0

    def test_err_missing_bundler_url_non_empty(self):
        assert isinstance(ERR_MISSING_BUNDLER_URL, str)
        assert len(ERR_MISSING_BUNDLER_URL) > 0

    def test_err_missing_entry_point_non_empty(self):
        assert isinstance(ERR_MISSING_ENTRY_POINT, str)
        assert len(ERR_MISSING_ENTRY_POINT) > 0

    def test_err_gas_estimation_failed_non_empty(self):
        assert isinstance(ERR_GAS_ESTIMATION_FAILED, str)
        assert len(ERR_GAS_ESTIMATION_FAILED) > 0

    def test_err_send_failed_non_empty(self):
        assert isinstance(ERR_SEND_FAILED, str)
        assert len(ERR_SEND_FAILED) > 0

    def test_err_receipt_timeout_non_empty(self):
        assert isinstance(ERR_RECEIPT_TIMEOUT, str)
        assert len(ERR_RECEIPT_TIMEOUT) > 0

    def test_error_constants_are_distinct(self):
        """All error constants should be distinct values."""
        constants = [
            ERR_MISSING_USER_OPERATION,
            ERR_MISSING_BUNDLER_URL,
            ERR_MISSING_ENTRY_POINT,
            ERR_GAS_ESTIMATION_FAILED,
            ERR_SEND_FAILED,
            ERR_RECEIPT_TIMEOUT,
        ]
        assert len(constants) == len(set(constants)), "Duplicate error constant values found"
