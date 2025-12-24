"""EVM integration tests for x402Client, x402ResourceServer, and x402Facilitator.

These tests perform REAL blockchain transactions on Base Sepolia.

Required environment variables:
- EVM_CLIENT_PRIVATE_KEY: Private key for the client (payer)
- EVM_FACILITATOR_PRIVATE_KEY: Private key for the facilitator

These must be funded accounts on Base Sepolia with USDC.
"""

import os
from typing import Any

import pytest
from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from x402 import x402Client, x402Facilitator, x402ResourceServer
from x402.schemas import (
    PaymentPayload,
    PaymentRequirements,
    ResourceConfig,
    ResourceInfo,
    SettleResponse,
    SupportedKind,
    SupportedResponse,
    VerifyResponse,
)

from x402.mechanisms.evm import (
    SCHEME_EXACT,
    TX_STATUS_SUCCESS,
    TypedDataDomain,
    TypedDataField,
    TransactionReceipt,
)
from x402.mechanisms.evm.exact import (
    ExactEvmClientScheme,
    ExactEvmServerScheme,
    ExactEvmFacilitatorScheme,
    ExactEvmSchemeConfig,
)

# =============================================================================
# Environment Variable Loading
# =============================================================================

CLIENT_PRIVATE_KEY = os.environ.get("EVM_CLIENT_PRIVATE_KEY")
FACILITATOR_PRIVATE_KEY = os.environ.get("EVM_FACILITATOR_PRIVATE_KEY")

# Base Sepolia RPC URL
RPC_URL = os.environ.get("EVM_RPC_URL", "https://sepolia.base.org")

# Base Sepolia USDC contract
USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

# Skip all tests if environment variables aren't set
pytestmark = pytest.mark.skipif(
    not CLIENT_PRIVATE_KEY or not FACILITATOR_PRIVATE_KEY,
    reason="EVM_CLIENT_PRIVATE_KEY and EVM_FACILITATOR_PRIVATE_KEY environment variables required for EVM integration tests",
)


# =============================================================================
# ERC20 ABI (minimal for transfer authorization)
# =============================================================================

ERC20_ABI = [
    {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "authorizer", "type": "address"},
            {"name": "nonce", "type": "bytes32"},
        ],
        "name": "authorizationState",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "from", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "value", "type": "uint256"},
            {"name": "validAfter", "type": "uint256"},
            {"name": "validBefore", "type": "uint256"},
            {"name": "nonce", "type": "bytes32"},
            {"name": "v", "type": "uint8"},
            {"name": "r", "type": "bytes32"},
            {"name": "s", "type": "bytes32"},
        ],
        "name": "transferWithAuthorization",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

EIP1271_ABI = [
    {
        "inputs": [
            {"name": "_hash", "type": "bytes32"},
            {"name": "_signature", "type": "bytes"},
        ],
        "name": "isValidSignature",
        "outputs": [{"name": "", "type": "bytes4"}],
        "stateMutability": "view",
        "type": "function",
    },
]


# =============================================================================
# Real Blockchain Signers
# =============================================================================


class RealClientEvmSigner:
    """Real client signer using eth_account for signing EIP-712 typed data."""

    def __init__(self, private_key: str):
        """Create signer from private key.

        Args:
            private_key: Hex private key with or without 0x prefix.
        """
        if not private_key.startswith("0x"):
            private_key = "0x" + private_key
        self._account = Account.from_key(private_key)

    @property
    def address(self) -> str:
        """Get checksummed address."""
        return self._account.address

    def sign_typed_data(
        self,
        domain: TypedDataDomain,
        types: dict[str, list[TypedDataField]],
        primary_type: str,
        message: dict[str, Any],
    ) -> bytes:
        """Sign EIP-712 typed data.

        Args:
            domain: EIP-712 domain.
            types: Type definitions.
            primary_type: Primary type name.
            message: Message data.

        Returns:
            65-byte signature.
        """
        # Build EIP-712 types
        eip712_types = {}
        for type_name, fields in types.items():
            eip712_types[type_name] = [{"name": f.name, "type": f.type} for f in fields]

        # Handle bytes32 nonce - convert to hex string for eth_account
        msg_copy = message.copy()
        if "nonce" in msg_copy and isinstance(msg_copy["nonce"], bytes):
            msg_copy["nonce"] = "0x" + msg_copy["nonce"].hex()

        domain_dict = {
            "name": domain.name,
            "version": domain.version,
            "chainId": domain.chain_id,
            "verifyingContract": domain.verifying_contract,
        }

        signed = self._account.sign_typed_data(
            domain_data=domain_dict,
            message_types=eip712_types,
            message_data=msg_copy,
        )

        return signed.signature


class RealFacilitatorEvmSigner:
    """Real facilitator signer using web3.py for blockchain interactions."""

    def __init__(self, private_key: str, rpc_url: str = RPC_URL):
        """Create signer from private key.

        Args:
            private_key: Hex private key with or without 0x prefix.
            rpc_url: Ethereum RPC URL.
        """
        if not private_key.startswith("0x"):
            private_key = "0x" + private_key
        self._account = Account.from_key(private_key)
        self._w3 = Web3(Web3.HTTPProvider(rpc_url))
        # Add PoA middleware for testnets
        self._w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

    def get_addresses(self) -> list[str]:
        """Get facilitator addresses."""
        return [self._account.address]

    def read_contract(
        self,
        address: str,
        abi: list[dict[str, Any]],
        function_name: str,
        *args: Any,
    ) -> Any:
        """Read from a smart contract.

        Args:
            address: Contract address.
            abi: Contract ABI.
            function_name: Function to call.
            *args: Function arguments.

        Returns:
            Function return value.
        """
        contract = self._w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=abi,
        )
        func = getattr(contract.functions, function_name)
        return func(*args).call()

    def verify_typed_data(
        self,
        address: str,
        domain: TypedDataDomain,
        types: dict[str, list[TypedDataField]],
        primary_type: str,
        message: dict[str, Any],
        signature: bytes,
    ) -> bool:
        """Verify an EIP-712 signature.

        For EOAs, recovers the address from the signature.
        For smart contracts, calls isValidSignature (EIP-1271).

        Args:
            address: Expected signer address.
            domain: EIP-712 domain.
            types: Type definitions.
            primary_type: Primary type name.
            message: Message data.
            signature: Signature bytes.

        Returns:
            True if signature is valid.
        """
        # Build full types including EIP712Domain
        full_types = {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ]
        }
        for type_name, fields in types.items():
            full_types[type_name] = [{"name": f.name, "type": f.type} for f in fields]

        # Handle bytes32 nonce
        msg_copy = message.copy()
        if "nonce" in msg_copy and isinstance(msg_copy["nonce"], bytes):
            msg_copy["nonce"] = "0x" + msg_copy["nonce"].hex()

        try:
            typed_data = {
                "types": full_types,
                "primaryType": primary_type,
                "domain": {
                    "name": domain.name,
                    "version": domain.version,
                    "chainId": domain.chain_id,
                    "verifyingContract": domain.verifying_contract,
                },
                "message": msg_copy,
            }
            recovered = Account.recover_message(
                encode_typed_data(full_message=typed_data),
                signature=signature,
            )

            if recovered.lower() == address.lower():
                return True

            # If EOA verification failed, try EIP-1271 for smart contract wallets
            code = self._w3.eth.get_code(Web3.to_checksum_address(address))
            if len(code) > 0:
                # It's a contract, try EIP-1271
                from eth_account._utils.typed_data import hash_typed_data

                struct_hash = hash_typed_data(typed_data)
                contract = self._w3.eth.contract(
                    address=Web3.to_checksum_address(address),
                    abi=EIP1271_ABI,
                )
                try:
                    result = contract.functions.isValidSignature(
                        struct_hash,
                        signature,
                    ).call()
                    return result == b"\x16\x26\xba\x7e"  # EIP-1271 magic value
                except Exception:
                    return False

            return False
        except Exception as e:
            print(f"Signature verification error: {e}")
            return False

    def write_contract(
        self,
        address: str,
        abi: list[dict[str, Any]],
        function_name: str,
        *args: Any,
    ) -> str:
        """Write to a smart contract.

        Args:
            address: Contract address.
            abi: Contract ABI.
            function_name: Function to call.
            *args: Function arguments.

        Returns:
            Transaction hash.
        """
        contract = self._w3.eth.contract(
            address=Web3.to_checksum_address(address),
            abi=abi,
        )
        func = getattr(contract.functions, function_name)

        # Build transaction
        tx = func(*args).build_transaction(
            {
                "from": self._account.address,
                "nonce": self._w3.eth.get_transaction_count(self._account.address),
                "gas": 200000,
                "gasPrice": self._w3.eth.gas_price,
            }
        )

        # Sign and send
        signed_tx = self._account.sign_transaction(tx)
        tx_hash = self._w3.eth.send_raw_transaction(signed_tx.raw_transaction)

        return tx_hash.hex()

    def send_transaction(self, to: str, data: bytes) -> str:
        """Send a raw transaction.

        Args:
            to: Recipient address.
            data: Transaction data.

        Returns:
            Transaction hash.
        """
        tx = {
            "from": self._account.address,
            "to": Web3.to_checksum_address(to),
            "data": data,
            "nonce": self._w3.eth.get_transaction_count(self._account.address),
            "gas": 200000,
            "gasPrice": self._w3.eth.gas_price,
        }

        signed_tx = self._account.sign_transaction(tx)
        tx_hash = self._w3.eth.send_raw_transaction(signed_tx.raw_transaction)

        return tx_hash.hex()

    def wait_for_transaction_receipt(self, tx_hash: str) -> TransactionReceipt:
        """Wait for a transaction receipt.

        Args:
            tx_hash: Transaction hash.

        Returns:
            Transaction receipt.
        """
        if not tx_hash.startswith("0x"):
            tx_hash = "0x" + tx_hash
        receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        return TransactionReceipt(
            status=TX_STATUS_SUCCESS if receipt["status"] == 1 else 0,
            block_number=receipt["blockNumber"],
            tx_hash=tx_hash,
        )

    def get_balance(self, address: str, token_address: str) -> int:
        """Get ERC20 token balance.

        Args:
            address: Account address.
            token_address: Token contract address.

        Returns:
            Token balance.
        """
        contract = self._w3.eth.contract(
            address=Web3.to_checksum_address(token_address),
            abi=ERC20_ABI,
        )
        return contract.functions.balanceOf(Web3.to_checksum_address(address)).call()

    def get_chain_id(self) -> int:
        """Get chain ID."""
        return self._w3.eth.chain_id

    def get_code(self, address: str) -> bytes:
        """Get contract code at address.

        Args:
            address: Contract address.

        Returns:
            Contract bytecode (empty for EOA).
        """
        return self._w3.eth.get_code(Web3.to_checksum_address(address))


# =============================================================================
# Facilitator Client Wrapper
# =============================================================================


class EvmFacilitatorClient:
    """Facilitator client wrapper for the x402ResourceServer."""

    scheme = SCHEME_EXACT
    network = "eip155:84532"
    x402_version = 2

    def __init__(self, facilitator: x402Facilitator):
        """Create wrapper.

        Args:
            facilitator: The x402Facilitator to wrap.
        """
        self._facilitator = facilitator

    def verify(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> VerifyResponse:
        """Verify payment."""
        return self._facilitator.verify(payload, requirements)

    def settle(
        self,
        payload: PaymentPayload,
        requirements: PaymentRequirements,
    ) -> SettleResponse:
        """Settle payment."""
        return self._facilitator.settle(payload, requirements)

    def get_supported(self) -> SupportedResponse:
        """Get supported kinds."""
        return self._facilitator.get_supported()


# =============================================================================
# Helper Functions
# =============================================================================


def build_evm_payment_requirements(
    pay_to: str,
    amount: str,
    network: str = "eip155:84532",
) -> PaymentRequirements:
    """Build EVM payment requirements for testing.

    Args:
        pay_to: Recipient address.
        amount: Amount in smallest units.
        network: Network identifier.

    Returns:
        Payment requirements.
    """
    return PaymentRequirements(
        scheme=SCHEME_EXACT,
        network=network,
        asset=USDC_ADDRESS,
        amount=amount,
        pay_to=pay_to,
        max_timeout_seconds=3600,
        extra={
            "name": "USDC",
            "version": "2",
        },
    )


# =============================================================================
# Test Classes
# =============================================================================


class TestEvmIntegrationV2:
    """Integration tests for EVM V2 payment flow with REAL blockchain transactions."""

    def setup_method(self) -> None:
        """Set up test fixtures with real blockchain clients."""
        # Create real signers
        self.client_signer = RealClientEvmSigner(CLIENT_PRIVATE_KEY)
        self.facilitator_signer = RealFacilitatorEvmSigner(FACILITATOR_PRIVATE_KEY)

        # Store client address for assertions
        self.client_address = self.client_signer.address

        # Create client with EVM scheme
        self.client = x402Client().register(
            "eip155:84532",
            ExactEvmClientScheme(self.client_signer),
        )

        # Create facilitator with EVM scheme
        self.facilitator = x402Facilitator().register(
            ["eip155:84532"],
            ExactEvmFacilitatorScheme(
                self.facilitator_signer,
                ExactEvmSchemeConfig(deploy_erc4337_with_eip6492=True),
            ),
        )

        # Create facilitator client wrapper
        facilitator_client = EvmFacilitatorClient(self.facilitator)

        # Create resource server with EVM scheme
        self.server = x402ResourceServer(facilitator_client)
        self.server.register("eip155:84532", ExactEvmServerScheme())
        self.server.initialize()

    def test_server_should_successfully_verify_and_settle_evm_payment_from_client(
        self,
    ) -> None:
        """Test the complete EVM V2 payment flow with REAL blockchain transactions.

        This test:
        1. Creates payment requirements
        2. Client signs an EIP-3009 authorization
        3. Server verifies the signature on-chain
        4. Server settles by submitting transferWithAuthorization to Base Sepolia

        WARNING: This will spend real testnet USDC!
        """
        # Use facilitator address as recipient for testing
        recipient = self.facilitator_signer.get_addresses()[0]

        # Server - builds PaymentRequired response
        accepts = [
            build_evm_payment_requirements(
                recipient,
                "1000",  # 0.001 USDC (1000 units with 6 decimals)
            )
        ]
        resource = ResourceInfo(
            url="https://api.example.com/premium",
            description="Premium API Access",
            mime_type="application/json",
        )
        payment_required = self.server.create_payment_required_response(accepts, resource)

        # Verify V2
        assert payment_required.x402_version == 2

        # Client - creates payment payload (signs EIP-3009 authorization)
        payment_payload = self.client.create_payment_payload(payment_required)

        # Verify payload structure
        assert payment_payload.x402_version == 2
        assert payment_payload.accepted.scheme == SCHEME_EXACT
        assert payment_payload.accepted.network == "eip155:84532"
        assert "authorization" in payment_payload.payload
        assert "signature" in payment_payload.payload

        auth = payment_payload.payload["authorization"]
        assert auth["from"].lower() == self.client_address.lower()
        assert auth["to"].lower() == recipient.lower()
        assert auth["value"] == "1000"

        # Server - finds matching requirements
        accepted = self.server.find_matching_requirements(accepts, payment_payload)
        assert accepted is not None

        # Server - verifies payment (real signature verification)
        verify_response = self.server.verify_payment(payment_payload, accepted)

        if not verify_response.is_valid:
            print(f"❌ Verification failed: {verify_response.invalid_reason}")
            print(f"Payer: {verify_response.payer}")
            print(f"Client address: {self.client_address}")

        assert verify_response.is_valid is True
        assert verify_response.payer.lower() == self.client_address.lower()

        # Server does work here...

        # Server - settles payment (REAL on-chain transaction!)
        settle_response = self.server.settle_payment(payment_payload, accepted)

        if not settle_response.success:
            print(f"❌ Settlement failed: {settle_response.error_reason}")

        assert settle_response.success is True
        assert settle_response.network == "eip155:84532"
        assert settle_response.transaction != ""
        assert settle_response.payer.lower() == self.client_address.lower()

        print(f"✅ Transaction settled: {settle_response.transaction}")

    def test_client_creates_valid_evm_payment_payload(self) -> None:
        """Test that client creates properly structured EVM payload."""
        accepts = [
            build_evm_payment_requirements(
                "0x1234567890123456789012345678901234567890",
                "5000000",  # 5 USDC
            )
        ]
        payment_required = self.server.create_payment_required_response(accepts)

        payload = self.client.create_payment_payload(payment_required)

        assert payload.x402_version == 2
        assert payload.accepted.scheme == SCHEME_EXACT
        assert payload.accepted.amount == "5000000"

        # Check EVM payload structure
        assert "authorization" in payload.payload
        assert "signature" in payload.payload

        auth = payload.payload["authorization"]
        assert auth["from"].lower() == self.client_address.lower()
        assert auth["value"] == "5000000"
        assert auth["nonce"].startswith("0x")
        assert len(auth["nonce"]) == 66  # 0x + 64 hex chars

    def test_invalid_recipient_fails_verification(self) -> None:
        """Test that mismatched recipient fails verification."""
        accepts = [
            build_evm_payment_requirements(
                "0x1111111111111111111111111111111111111111",
                "1000",
            )
        ]
        payment_required = self.server.create_payment_required_response(accepts)
        payload = self.client.create_payment_payload(payment_required)

        # Change recipient in requirements
        different_accepts = [
            build_evm_payment_requirements(
                "0x2222222222222222222222222222222222222222",
                "1000",
            )
        ]

        # Manually verify with different requirements
        verify_response = self.server.verify_payment(payload, different_accepts[0])
        assert verify_response.is_valid is False
        assert "recipient" in verify_response.invalid_reason.lower()

    def test_insufficient_amount_fails_verification(self) -> None:
        """Test that insufficient amount fails verification."""
        accepts = [
            build_evm_payment_requirements(
                self.facilitator_signer.get_addresses()[0],
                "1000",  # Client pays 1000
            )
        ]
        payment_required = self.server.create_payment_required_response(accepts)
        payload = self.client.create_payment_payload(payment_required)

        # Try to verify against higher amount
        higher_accepts = [
            build_evm_payment_requirements(
                self.facilitator_signer.get_addresses()[0],
                "2000",  # Require 2000
            )
        ]

        verify_response = self.server.verify_payment(payload, higher_accepts[0])
        assert verify_response.is_valid is False
        assert (
            "amount" in verify_response.invalid_reason.lower()
            or "value" in verify_response.invalid_reason.lower()
        )

    def test_facilitator_get_supported(self) -> None:
        """Test that facilitator returns supported kinds."""
        supported = self.facilitator.get_supported()

        assert len(supported.kinds) >= 1

        # Find eip155:84532 support
        evm_support = None
        for kind in supported.kinds:
            if kind.network == "eip155:84532" and kind.scheme == SCHEME_EXACT:
                evm_support = kind
                break

        assert evm_support is not None
        assert evm_support.x402_version == 2


class TestEvmPriceParsing:
    """Tests for EVM server price parsing (no blockchain transactions needed)."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.facilitator_signer = RealFacilitatorEvmSigner(FACILITATOR_PRIVATE_KEY)
        self.facilitator = x402Facilitator().register(
            ["eip155:84532"],
            ExactEvmFacilitatorScheme(self.facilitator_signer),
        )

        facilitator_client = EvmFacilitatorClient(self.facilitator)
        self.server = x402ResourceServer(facilitator_client)
        self.evm_server = ExactEvmServerScheme()
        self.server.register("eip155:84532", self.evm_server)
        self.server.initialize()

    def test_parse_money_formats(self) -> None:
        """Test parsing different Money formats."""
        test_cases = [
            ("$1.00", "1000000"),
            ("1.50", "1500000"),
            (2.5, "2500000"),
            ("$0.001", "1000"),
        ]

        for input_price, expected_amount in test_cases:
            config = ResourceConfig(
                scheme=SCHEME_EXACT,
                pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
                price=input_price,
                network="eip155:84532",
            )
            requirements = self.server.build_payment_requirements(config)

            assert len(requirements) == 1
            assert requirements[0].amount == expected_amount
            assert requirements[0].asset == USDC_ADDRESS

    def test_asset_amount_passthrough(self) -> None:
        """Test that AssetAmount is passed through directly."""
        from x402.schemas import AssetAmount

        custom_asset = AssetAmount(
            amount="5000000",
            asset="0xCustomToken1234567890123456789012345678",
            extra={"foo": "bar"},
        )

        config = ResourceConfig(
            scheme=SCHEME_EXACT,
            pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            price=custom_asset,
            network="eip155:84532",
        )
        requirements = self.server.build_payment_requirements(config)

        assert len(requirements) == 1
        assert requirements[0].amount == "5000000"
        assert requirements[0].asset == "0xCustomToken1234567890123456789012345678"

    def test_custom_money_parser(self) -> None:
        """Test registering custom money parser."""

        # Register custom parser for large amounts
        def large_amount_parser(amount: float, network: str):
            if amount > 100:
                from x402.schemas import AssetAmount

                return AssetAmount(
                    amount=str(int(amount * 1e18)),  # DAI has 18 decimals
                    asset="0x6B175474E89094C44Da98b954EedeAC495271d0F",
                    extra={"token": "DAI", "tier": "large"},
                )
            return None

        self.evm_server.register_money_parser(large_amount_parser)

        # Large amount - should use custom parser
        config = ResourceConfig(
            scheme=SCHEME_EXACT,
            pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            price=150,
            network="eip155:84532",
        )
        large_req = self.server.build_payment_requirements(config)

        assert large_req[0].extra.get("token") == "DAI"
        assert large_req[0].extra.get("tier") == "large"

        # Small amount - should use default USDC
        config2 = ResourceConfig(
            scheme=SCHEME_EXACT,
            pay_to="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            price=50,
            network="eip155:84532",
        )
        small_req = self.server.build_payment_requirements(config2)

        assert small_req[0].asset == USDC_ADDRESS
