import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from sangria_sdk import SangriaError, SangriaMerchantClient
from sangria_sdk.adapters.fastapi import require_sangria_payment

app = FastAPI(title="Merchant FastAPI")
logger = logging.getLogger(__name__)

client = SangriaMerchantClient(
    base_url=os.getenv("SANGRIA_URL", "http://localhost:8080"),
    api_key=os.getenv("SANGRIA_SECRET_KEY", "sk_test_abc123"),
)


# Catches SangriaError from any require_sangria_payment-decorated route.
@app.exception_handler(SangriaError)
async def sangria_error_handler(_request: Request, exc: SangriaError):
    logger.error("[sangria:%s] %s", exc.operation, exc.message)
    return JSONResponse(
        status_code=503,
        content={"error": "Payment provider unavailable, please retry shortly."},
    )


@app.get("/")
async def health():
    return {"message": "Hello! This endpoint is free."}


@app.get("/premium")
@require_sangria_payment(client, amount=0.01, description="Access premium content")
async def premium(request: Request):
    return {"message": "You accessed the premium endpoint!"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "4004"))
    uvicorn.run(app, host="0.0.0.0", port=port)
