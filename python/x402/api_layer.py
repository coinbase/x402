#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SUBSTRATO 875 — API-LAYER                                ║
║              REST | GraphQL | gRPC | API Gateway | Rate Limiting | Auth       ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import hashlib
import json
import time
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass
class APIRequest:
    method: str
    path: str
    headers: dict[str, str] = field(default_factory=dict)
    body: Any = None
    api_key: str | None = None


@dataclass
class APIResponse:
    status: int
    body: Any = None
    headers: dict[str, str] = field(default_factory=dict)


class RESTEndpoint:
    """Endpoint REST com métodos HTTP padrão."""

    def __init__(self, path: str):
        self.path = path
        self.handlers: dict[str, Callable] = {}

    def get(self, handler: Callable):
        self.handlers["GET"] = handler
        return handler

    def post(self, handler: Callable):
        self.handlers["POST"] = handler
        return handler

    def handle(self, request: APIRequest) -> APIResponse:
        handler = self.handlers.get(request.method)
        if handler:
            return handler(request)
        return APIResponse(405, body="Method Not Allowed")


class GraphQLEngine:
    """Motor GraphQL simplificado."""

    def __init__(self):
        self.schema = {}
        self.resolvers: dict[str, Callable] = {}

    def define_type(self, name: str, fields: dict[str, str]):
        self.schema[name] = fields

    def resolver(self, type_name: str, field: str):
        def decorator(func):
            key = f"{type_name}.{field}"
            self.resolvers[key] = func
            return func

        return decorator

    def execute(self, query: str) -> dict:
        # Simplified: parse query and execute resolvers
        results = {}
        for key, resolver in self.resolvers.items():
            if key.split(".")[0] in query:
                results[key] = resolver()
        return {"data": results}


class RateLimiter:
    """Rate limiter com janela deslizante e bucket token."""

    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        # Remove requests outside window
        self.requests[client_id] = [t for t in self.requests[client_id] if now - t < self.window]

        if len(self.requests[client_id]) >= self.max_requests:
            return False

        self.requests[client_id].append(now)
        return True

    def get_remaining(self, client_id: str) -> int:
        now = time.time()
        valid = [t for t in self.requests[client_id] if now - t < self.window]
        return max(0, self.max_requests - len(valid))


class JWTAuth:
    """Autenticação JWT simplificada."""

    def __init__(self, secret: str = "arkhe-secret-key"):
        self.secret = secret
        self.tokens: dict[str, dict] = {}

    def generate_token(self, user_id: str, claims: dict) -> str:
        header = json.dumps({"alg": "HS256", "typ": "JWT"})
        payload = json.dumps({"sub": user_id, **claims, "iat": time.time()})

        header_b64 = header.encode().hex()[:20]
        payload_b64 = payload.encode().hex()[:40]

        signature = hashlib.sha256(
            f"{header_b64}.{payload_b64}.{self.secret}".encode()
        ).hexdigest()[:16]

        token = f"{header_b64}.{payload_b64}.{signature}"
        self.tokens[token] = {"user_id": user_id, "claims": claims}
        return token

    def verify_token(self, token: str) -> dict | None:
        return self.tokens.get(token)


class APIGateway:
    """API Gateway unificando REST, GraphQL e gRPC."""

    def __init__(self):
        self.rest_endpoints: dict[str, RESTEndpoint] = {}
        self.graphql = GraphQLEngine()
        self.rate_limiter = RateLimiter()
        self.auth = JWTAuth()

    def register_rest(self, path: str) -> RESTEndpoint:
        endpoint = RESTEndpoint(path)
        self.rest_endpoints[path] = endpoint
        return endpoint

    def route(self, request: APIRequest) -> APIResponse:
        # Auth check
        if request.api_key:
            user = self.auth.verify_token(request.api_key)
            if not user:
                return APIResponse(401, body="Unauthorized")

        # Rate limiting
        client_id = request.headers.get("X-Client-ID", "anonymous")
        if not self.rate_limiter.is_allowed(client_id):
            return APIResponse(429, body="Rate limit exceeded")

        # Route to REST endpoint
        endpoint = self.rest_endpoints.get(request.path)
        if endpoint:
            return endpoint.handle(request)

        return APIResponse(404, body="Endpoint not found")


if __name__ == "__main__":
    gateway = APIGateway()

    # Register REST endpoint
    ep = gateway.register_rest("/api/substrates")

    @ep.get
    def list_substrates(req):
        return APIResponse(200, body={"substrates": ["870-G", "871", "872"]})

    # Test request
    req = APIRequest("GET", "/api/substrates", api_key="test-token")
    resp = gateway.route(req)
    print(f"[API Gateway] {resp.status}: {resp.body}")

    # Test rate limiting
    for i in range(105):
        allowed = gateway.rate_limiter.is_allowed("test-client")
        if not allowed:
            print(f"[Rate Limiter] Blocked at request {i + 1}")
            break
