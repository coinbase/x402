from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from common import setup_exception_handlers
from delayed_settlement import router as delayed_settlement_router
from dynamic_price import router as dynamic_price_router
from multiple_payment import router as multiple_payment_router

app = FastAPI(title="x402 Advanced Server Example (V2)")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "payment-required",
        "payment-response",
        "www-authenticate",
        "payment-signature",
    ],
)

# Setup Exception Handlers (402 Logic)
setup_exception_handlers(app)

# Include Routers
app.include_router(delayed_settlement_router)
app.include_router(dynamic_price_router)
app.include_router(multiple_payment_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=4021)
