"""Tests for TVM signer protocol compliance."""

from x402.mechanisms.tvm.signer import ClientTvmSigner, FacilitatorTvmSigner


class MockClientSigner:
    """Mock client signer implementing ClientTvmSigner protocol."""

    def __init__(self):
        self._address = "0:" + "a" * 64
        self._public_key = "b" * 64

    @property
    def address(self) -> str:
        return self._address

    @property
    def public_key(self) -> str:
        return self._public_key

    async def sign_transfer(self, seqno, valid_until, messages):
        return "base64_signed_boc"


class MockFacilitatorSigner:
    """Mock facilitator signer implementing FacilitatorTvmSigner protocol."""

    async def get_seqno(self, address):
        return 42

    async def get_jetton_wallet(self, master, owner):
        return "0:" + "d" * 64

    async def get_account_state(self, address):
        return {"balance": 1000, "status": "active", "code_hash": "abc"}

    async def get_transaction(self, tx_hash):
        return None

    async def gasless_estimate(self, **kwargs):
        return {"messages": [], "commission": "0"}

    async def gasless_send(self, boc, wallet_public_key):
        return "msg_hash_123"

    async def get_gasless_config(self):
        return {"relay_address": "0:" + "e" * 64, "gas_jettons": []}


class TestClientTvmSignerProtocol:
    """Test ClientTvmSigner protocol."""

    def test_mock_implements_protocol(self):
        signer = MockClientSigner()
        assert isinstance(signer, ClientTvmSigner)

    def test_address_property(self):
        signer = MockClientSigner()
        assert signer.address.startswith("0:")
        assert len(signer.address) == 66  # 0: + 64 hex

    def test_public_key_property(self):
        signer = MockClientSigner()
        assert len(signer.public_key) == 64

    def test_has_sign_transfer_method(self):
        signer = MockClientSigner()
        assert hasattr(signer, "sign_transfer")
        assert callable(signer.sign_transfer)


class TestFacilitatorTvmSignerProtocol:
    """Test FacilitatorTvmSigner protocol."""

    def test_mock_implements_protocol(self):
        signer = MockFacilitatorSigner()
        assert isinstance(signer, FacilitatorTvmSigner)

    def test_has_required_methods(self):
        signer = MockFacilitatorSigner()
        assert hasattr(signer, "get_seqno")
        assert hasattr(signer, "get_jetton_wallet")
        assert hasattr(signer, "get_account_state")
        assert hasattr(signer, "get_transaction")
        assert hasattr(signer, "gasless_estimate")
        assert hasattr(signer, "gasless_send")
        assert hasattr(signer, "get_gasless_config")

    def test_all_methods_are_callable(self):
        signer = MockFacilitatorSigner()
        assert callable(signer.get_seqno)
        assert callable(signer.get_jetton_wallet)
        assert callable(signer.get_account_state)
        assert callable(signer.get_transaction)
        assert callable(signer.gasless_estimate)
        assert callable(signer.gasless_send)
        assert callable(signer.get_gasless_config)
