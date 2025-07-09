import json
from typing import List, Dict, Tuple, Callable, Any

from x402.types import PaymentRequirements, x402PaymentRequiredResponse
from x402.common import x402_VERSION
from .html import get_paywall_html


def create_html_response(
    error: str,
    payment_requirements: List[PaymentRequirements]
) -> Tuple[str, int, Dict[str, str]]:
    """
    Create HTML paywall response.
    
    Args:
        error: Error message to display
        payment_requirements: List of payment requirements
        
    Returns:
        Tuple of (content, status_code, headers) for framework-agnostic handling
    """
    # Get complete HTML with injected payment data
    html_with_data = get_paywall_html(error, payment_requirements)
    
    headers = {"Content-Type": "text/html; charset=utf-8"}
    return html_with_data, 402, headers


def create_json_response(
    error: str,
    payment_requirements: List[PaymentRequirements]
) -> Tuple[Dict, int, Dict[str, str]]:
    """
    Create JSON paywall response.
    
    Args:
        error: Error message to include
        payment_requirements: List of payment requirements
        
    Returns:
        Tuple of (content_dict, status_code, headers) for framework-agnostic handling
    """
    response_data = x402PaymentRequiredResponse(
        x402_version=x402_VERSION,
        accepts=payment_requirements,
        error=error,
    ).model_dump(by_alias=True)
    
    headers = {"Content-Type": "application/json"}
    return response_data, 402, headers


def convert_to_wsgi_response(
    content: Any, 
    status_code: int, 
    headers: Dict[str, str], 
    start_response: Callable
) -> List[bytes]:
    """
    Convert generic response tuple to WSGI format for Flask.
    
    Args:
        content: Response content (str for HTML, dict for JSON)
        status_code: HTTP status code
        headers: Response headers dict
        start_response: WSGI start_response callable
        
    Returns:
        List of bytes for WSGI response
    """
    # Convert content to string if it's a dict (JSON)
    if isinstance(content, dict):
        content_str = json.dumps(content)
    else:
        content_str = str(content)
    
    # Convert to WSGI format
    status = f"{status_code} Payment Required"
    wsgi_headers = [(k, v) for k, v in headers.items()]
    
    # Add Content-Length header
    content_bytes = content_str.encode("utf-8")
    wsgi_headers.append(("Content-Length", str(len(content_bytes))))
    
    start_response(status, wsgi_headers)
    return [content_bytes]


 