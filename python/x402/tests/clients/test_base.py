import pytest
from x402.clients.base import x402Client
from web3 import Web3
from web3.middleware import SignAndSendRawMiddlewareBuilder

from x402.types import PaymentRequirements


@pytest.fixture
def web3():
    w3 = Web3(Web3.HTTPProvider("https://sepolia.base.org"))
    account = w3.eth.account.create()
    w3.middleware_onion.inject(SignAndSendRawMiddlewareBuilder.build(account), layer=0)

    return w3


# def test_signed_exact_evm_payment_payload(web3):
#     client = x402Client(web3)
#     signed_message = client._signed_exact_evm_payment_payload(
#         PaymentRequirements(
#             scheme="exact",
#             network="base-sepolia",
#             asset="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
#             pay_to="0x0000000000000000000000000000000000000000",
#             max_amount_required="10000",
#             resource="https://example.com",
#             description="test",
#             max_timeout_seconds=1000,
#             mime_type="text/plain",
#             output_schema=None,
#         )
#     )

#     recovered_address = web3.geth.personal.ecRecover(signed_message)
#     assert recovered_address == web3.eth.account.address
