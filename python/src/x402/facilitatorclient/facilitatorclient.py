import requests

from ..types import PaymentRequirements, PaymentPayload

# DefaultFacilitatorURL is the default URL for the x402 facilitator service
# DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator"
DEFAULT_FACILITATOR_URL = "http://localhost:3002"

class FacilitatorClient:
    def __init__(self, url=None):
        self.url = url or DEFAULT_FACILITATOR_URL

    def verify(self, payment_payload: PaymentPayload, payment_requirements: PaymentRequirements):
        """
        Verifies a payment with the facilitator

        Parameters
        ----------
        payment_payload: PaymentPayload
            The payment payload to verify
        payment_requirements: PaymentRequirements
            The payment requirements to verify against

        Returns
        -------
        dict
            The response from the facilitator

        Raises
        ------
        Exception
            If the request to the facilitator fails
        """
        req_body = {
            "x402Version": 1,
            "paymentPayload": payment_payload.to_dict() if isinstance(payment_payload, PaymentPayload) else payment_payload,
            "paymentRequirements": payment_requirements.to_dict() if isinstance(payment_requirements, PaymentRequirements) else payment_requirements
        }

        response = requests.post(f"{self.url}/verify", json=req_body)
        if response.status_code != 200:
            raise Exception(f"Failed to verify payment: {response.status_code} - {response.text}")

        return response.json()

    def settle(self, payment_payload: PaymentPayload, payment_requirements: PaymentRequirements):
        """
        Settles a payment with the facilitator

        Parameters
        ----------
        payment_payload: PaymentPayload
            The payment payload to settle
        payment_requirements: PaymentRequirements
            The payment requirements to settle against

        Returns
        -------
        dict
            The response from the facilitator

        Raises
        ------
        Exception
            If the request to the facilitator fails
        """
        req_body = {
            "x402Version": 1,
            "paymentPayload": payment_payload,
            "paymentRequirements": payment_requirements.to_dict() if isinstance(payment_requirements, PaymentRequirements) else payment_requirements
        }

        response = requests.post(f"{self.url}/settle", json=req_body)
        if response.status_code != 200:
            raise Exception(f"Failed to settle payment: {response.status_code} - {response.text}")

        return response.json()
