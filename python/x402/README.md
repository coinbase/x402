# x402 Python

Python package for the x402 payments protocol.

## Features

- [x] FastAPI Middleware for accepting payments
- [ ] httpx client for paying resources

## Example

```py
from fastapi import FastAPI
from x402.fastapi.middleware import require_payment

app = FastAPI()
app.middleware("http")(
    require_payment(amount="0.01", address="0x209693Bc6afc0C5328bA36FaF03C514EF312287C")
)


@app.get("/")
async def root():
    return {"message": "Hello World"}
```

This will charge $0.01 for every route on the router

To charge for a specific route:

```py
app.middleware("http")(
    require_payment(amount="0.01",
    address="0x209693Bc6afc0C5328bA36FaF03C514EF312287C"),
    path="/foo"  # <-- this can also be a list ex: ["/foo", "/bar"]
)


@app.get("/foo")
async def root():
    return {"message": "Hello World"}
```

Note: `path` must the be the fully qualified path due to how FastAPI mounts middleware

### Advanced Usage

You can also integrate x402 directly into your server by manually calling to the facilitator

```py
from typing import Annotated
from fastapi import FastAPI, Request
from x402.types import PaymentRequiredResponse, PaymentDetails
...

payment_details = PaymentDetails(...)
facilitator = FacilitatorClient(facilitator_url)

@app.get("/foo")
async def foo(req: request: Request):
    payment_required = PaymentRequiredResponse(
        paymentDetails=payment_details,
        error="",
    )
    payment = req.headers.get("X-PAYMENT", "")

    if payment == "":
        payment_required.error = "X-PAYMENT header not set"
        return JSONResponse(
            content=payment_required.model_dump(),
            status_code=402,
        )

    verify_response = await facilitator.verify(payment, payment_details)
    if not verify_response.is_valid:
        payment_required.error = "Invalid payment"
            return JSONResponse(
                content=payment_required.model_dump(),
                status_code=402,
            )
    ... # do your work

    settle_response = await facilitator.settle(payment, payment_details)
    if settle_response.success:
        response.headers["X-PAYMENT-RESPONSE"] = base64.b64encode(
            settle_response.model_dump_json().encode("utf-8")
        ).decode("utf-8")
    else:
        payment_required.error = "Settle failed: " + settle_response.error
        return JSONResponse(
            content=payment_required.model_dump(),
            status_code=402,
        )
```
