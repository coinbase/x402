from fastapi import FastAPI
from x402.fastapi.middleware import require_payment

app = FastAPI()
app.middleware("http")(
    require_payment(amount="0.01", address="0x209693Bc6afc0C5328bA36FaF03C514EF312287C")
)


@app.get("/")
async def root():
    return {"message": "Hello World"}
