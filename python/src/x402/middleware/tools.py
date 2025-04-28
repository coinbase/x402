import base64
import json


def decode_payment_payload_from_base64(encoded: str) -> dict:
    """
    Decode a base64 encoded payment payload.

    Parameters
    ----------
    encoded: str
        The base64 encoded payment payload.

    Returns
    -------
    dict
        The decoded payment payload as a dictionary.

    Raises
    ------
    Exception
        If the decoding fails or the payload is invalid.
    """
    if not encoded:
        return None

    try:
        decoded_bytes = base64.b64decode(encoded)
        payload = json.loads(decoded_bytes)
        return payload
    except Exception as e:
        raise Exception(f"Failed to decode payment payload: {str(e)}")


def encode_to_base64_string(data: dict) -> str:
    """
    Encode a dictionary to a base64 string.

    Parameters
    ----------
    data: dict
        The dictionary to encode.

    Returns
    -------
    str
        The base64 encoded string.
    """
    json_bytes = json.dumps(data).encode('utf-8')
    return base64.b64encode(json_bytes).decode('utf-8')
