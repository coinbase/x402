from typing import Dict, Any


def is_browser_request(headers: Dict[str, Any]) -> bool:
    """
    Determine if request is from a browser vs API client.
    
    Args:
        headers: Dictionary of request headers (case-insensitive keys)
        
    Returns:
        True if request appears to be from a browser, False otherwise
    """
    headers_lower = {k.lower(): v for k, v in headers.items()}
    accept_header = headers_lower.get("accept", "")
    user_agent = headers_lower.get("user-agent", "")

    if "text/html" in accept_header and "Mozilla" in user_agent:
        return True

    return False


def get_request_type_info(headers: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get detailed information about the request type for debugging.
    
    Args:
        headers: Dictionary of request headers
        
    Returns:
        Dictionary with request type analysis
    """
    headers_lower = {k.lower(): v for k, v in headers.items()}
    
    return {
        "is_browser": is_browser_request(headers),
        "accept_header": headers_lower.get("accept", ""),
        "user_agent": headers_lower.get("user-agent", ""),
        "x_requested_with": headers_lower.get("x-requested-with", ""),
        "content_type": headers_lower.get("content-type", ""),
        "accepts_html": "text/html" in headers_lower.get("accept", ""),
        "accepts_json": "application/json" in headers_lower.get("accept", ""),
    } 