from decimal import Decimal
from flask import request, jsonify, Response
from functools import wraps

from ..facilitatorclient import FacilitatorClient
from .tools import decode_payment_payload_from_base64, encode_to_base64_string
from ..types import PaymentRequirements

# DefaultFacilitatorURL is the default URL for the x402 facilitator service
DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator"

class X402PaymentMiddleware:
    def __init__(self, amount: str, address: str, **options):
        """
        Initializes the X402PaymentMiddleware with the given amount and address.

        Parameters
        ----------
        amount: str
            The amount to be paid
        address: str
            The address to which the payment is made
        options: dict
            Additional options for the middleware
        """
        self.amount = Decimal(amount)
        self.address = address

        self.options = {
            'facilitator_url': DEFAULT_FACILITATOR_URL,
            'max_timeout_seconds': 60,
            'testnet': True,
            'description': '',
            'mime_type': '',
            'output_schema': {},
            'custom_paywall_html': '',
            'resource': '',
            'resource_root_url': ''
        }
        self.options.update(options)

        self.facilitator_client = FacilitatorClient(self.options["facilitator_url"])


    def __call__(self, f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if self.options.get("testnet"):
                network = "base-sepolia"
                usdc_address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
            else:
                network = "base"
                usdc_address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

            user_agent = request.headers.get('User-Agent', '')
            accept_header = request.headers.get('Accept', '')
            is_web_browser = 'text/html' in accept_header and 'Mozilla' in user_agent

            if self.options['resource']:
                resource = self.options['resource']
            else:
                resource = self.options['resource_root_url'] + request.path

            max_amount_required = str(int(self.amount * 1000000))

            payment_requirements = PaymentRequirements(
                network=network,
                max_amount_required=max_amount_required,
                resource=resource,
                description=self.options['description'],
                mime_type=self.options['mime_type'],
                pay_to=self.address,
                max_timeout_seconds=self.options['max_timeout_seconds'],
                asset=usdc_address,
                output_schema=self.options['output_schema'],
            )

            payment_requirements.set_usdc_info(self.options['testnet'])

            payment_header = request.headers.get('X-PAYMENT')
            if not payment_header:
                if is_web_browser:
                    html = self.options['custom_paywall_html'] or "<html><body>Payment Required</body></html>"
                    return Response(html, status=402, content_type="text/html")
                else:
                    return jsonify({
                        "error": "X-PAYMENT header is required",
                        "accepts": [payment_requirements.to_dict()]
                    }), 402

            try:
                payment_payload = decode_payment_payload_from_base64(payment_header)

                verify_response = self.facilitator_client.verify(payment_payload, payment_requirements)
                if not verify_response.get('isValid', False):
                    return jsonify({
                        "error": verify_response.get('invalidReason', 'Invalid payment'),
                        "accepts": [payment_requirements.to_dict()]
                    }), 402

                response = f(*args, **kwargs)

                try:
                    settle_response = self.facilitator_client.settle(payment_payload, payment_requirements)

                    if isinstance(response, tuple):
                        resp_obj, status_code = response
                        headers = {}
                    elif isinstance(response, Response):
                        resp_obj = response
                        status_code = response.status_code
                        headers = dict(response.headers)
                    else:
                        resp_obj = response
                        status_code = 200
                        headers = {}

                    settle_response_header = encode_to_base64_string(settle_response)
                    headers['X-PAYMENT-RESPONSE'] = settle_response_header

                    if isinstance(response, Response):
                        for key, value in headers.items():
                            resp_obj.headers[key] = value
                        return resp_obj
                    else:
                        return resp_obj, status_code, headers
                except Exception as e:
                    return jsonify({
                        "error": str(e),
                        "accepts": [payment_requirements.to_dict()]
                    }), 402

            except Exception as e:
                return jsonify({"error": str(e)}), 500


        return decorated_function

def x402_payment_required(amount, address, **options):
    """
    Create a payment middleware for the given amount and address.

    Parameters
    ----------
    amount: str
        The amount to be paid
    address: str
        The address to which the payment is made
    options: dict
        Additional options for the middleware

    Returns
    -------
    X402PaymentMiddleware
        The payment middleware instance
    """
    middleware = X402PaymentMiddleware(amount, address, **options)
    return middleware
