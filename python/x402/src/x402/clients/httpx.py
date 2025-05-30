from httpx import Request, Response
from eth_account import Account
from web3 import Web3


class HttpxHooks:
    def on_request(self, request: Request):
        pass

    def on_response(self, response: Response):
        pass


def pay_for_request_hook(
    account: Web3,
):
    """ """

    pass
