from flask import Flask, g
from x402.flask.middleware import PaymentMiddleware


def create_app_with_middleware(configs):
    app = Flask(__name__)

    @app.route("/protected")
    def protected():
        return {"message": "protected"}

    @app.route("/unprotected")
    def unprotected():
        return {"message": "unprotected"}

    middleware = PaymentMiddleware(app)
    for cfg in configs:
        middleware.add(**cfg)
    return app


def test_payment_required_for_protected_route():
    app = create_app_with_middleware(
        [
            {
                "price": "$1.00",
                "pay_to_address": "0x1",
                "path": "/protected",
                "network": "base-sepolia",
            }
        ]
    )
    with app.test_client() as client:
        resp = client.get("/protected")
        assert resp.status_code == 402
        assert "accepts" in resp.json
        assert resp.json["error"].startswith("No X-PAYMENT header provided")


def test_unprotected_route():
    app = create_app_with_middleware(
        [
            {
                "price": "$1.00",
                "pay_to_address": "0x1",
                "path": "/protected",
                "network": "base-sepolia",
            }
        ]
    )
    with app.test_client() as client:
        resp = client.get("/unprotected")
        assert resp.status_code == 200
        assert resp.json == {"message": "unprotected"}


def test_invalid_payment_header():
    app = create_app_with_middleware(
        [
            {
                "price": "$1.00",
                "pay_to_address": "0x1",
                "path": "/protected",
                "network": "base-sepolia",
            }
        ]
    )
    with app.test_client() as client:
        resp = client.get("/protected", headers={"X-PAYMENT": "not_base64"})
        assert resp.status_code == 402
        assert "Invalid payment header format" in resp.json["error"]


def test_path_pattern_matching():
    app = Flask(__name__)

    @app.route("/foo")
    def foo():
        return {"foo": True}

    @app.route("/bar/123")
    def bar():
        return {"bar": True}

    middleware = PaymentMiddleware(app)
    middleware.add(
        price="$1.00",
        pay_to_address="0x1",
        path=["/foo", "/bar/*", "regex:^/baz/\\d+$"],
        network="base-sepolia",
    )
    with app.test_client() as client:
        assert client.get("/foo").status_code == 402
        assert client.get("/bar/123").status_code == 402

        # Not protected
        @app.route("/baz/abc")
        def baz():
            return {"baz": True}

        assert client.get("/baz/abc").status_code == 200


def test_multiple_middleware_configs():
    app = Flask(__name__)

    @app.route("/a")
    def a():
        return {"a": True}

    @app.route("/b")
    def b():
        return {"b": True}

    middleware = PaymentMiddleware(app)
    middleware.add(
        price="$1.00", pay_to_address="0x1", path="/a", network="base-sepolia"
    )
    middleware.add(
        price="$2.00", pay_to_address="0x2", path="/b", network="base-sepolia"
    )
    with app.test_client() as client:
        assert client.get("/a").status_code == 402
        assert client.get("/b").status_code == 402

        # Not protected
        @app.route("/c")
        def c():
            return {"c": True}

        assert client.get("/c").status_code == 200


def test_payment_details_in_g():
    app = Flask(__name__)

    @app.route("/protected")
    def protected():
        return {
            "has_payment_details": hasattr(g, "payment_details"),
            "has_verify_response": hasattr(g, "verify_response"),
        }

    middleware = PaymentMiddleware(app)
    middleware.add(
        price="$1.00", pay_to_address="0x1", path="/protected", network="base-sepolia"
    )
    with app.test_client() as client:
        resp = client.get("/protected")
        assert resp.status_code == 402
