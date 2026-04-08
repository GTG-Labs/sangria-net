"""
Mock Sangria backend for testing SDK integration.
Simulates the payment generation and settlement endpoints.
"""

import base64
import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any

app = FastAPI(title="Mock Sangria Backend", version="1.0.0")

# In-memory storage for demo purposes
generated_payments: Dict[str, Dict[str, Any]] = {}


class GeneratePaymentRequest(BaseModel):
    amount: float
    resource: str
    description: Optional[str] = None


class SettlePaymentRequest(BaseModel):
    payment_payload: str


@app.post("/v1/generate-payment")
async def generate_payment(request: GeneratePaymentRequest) -> Dict[str, Any]:
    """Generate a payment challenge"""
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    # Create a mock payment challenge
    challenge_id = f"challenge_{len(generated_payments) + 1}"
    payment_data = {
        "challenge_id": challenge_id,
        "amount": request.amount,
        "resource": request.resource,
        "description": request.description,
        "payment_url": f"https://wallet.example.com/pay/{challenge_id}",
        "expires_in": 3600
    }

    # Store for later settlement
    generated_payments[challenge_id] = {
        "amount": request.amount,
        "resource": request.resource,
        "settled": False
    }

    return payment_data


@app.post("/v1/settle-payment")
async def settle_payment(request: SettlePaymentRequest) -> Dict[str, Any]:
    """Settle a payment"""
    try:
        # In a real implementation, this would verify the payment signature
        # For testing, we'll accept any payload that looks like a challenge_id
        if request.payment_payload.startswith("challenge_"):
            challenge_id = request.payment_payload
        else:
            # Simulate signature verification failure
            return {
                "success": False,
                "error_message": "Invalid payment signature",
                "error_reason": "INVALID_SIGNATURE"
            }

        if challenge_id not in generated_payments:
            return {
                "success": False,
                "error_message": "Payment not found",
                "error_reason": "PAYMENT_NOT_FOUND"
            }

        payment_info = generated_payments[challenge_id]
        if payment_info["settled"]:
            return {
                "success": False,
                "error_message": "Payment already settled",
                "error_reason": "ALREADY_SETTLED"
            }

        # Mark as settled
        payment_info["settled"] = True
        transaction_id = f"tx_{challenge_id}"

        return {
            "success": True,
            "transaction": transaction_id,
            "amount": payment_info["amount"]
        }

    except Exception:
        return {
            "success": False,
            "error_message": "Payment settlement failed",
            "error_reason": "SETTLEMENT_ERROR"
        }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "generated_payments": len(generated_payments)}


@app.get("/")
async def root():
    """Root endpoint with API info"""
    return {
        "service": "Mock Sangria Backend",
        "version": "1.0.0",
        "endpoints": {
            "generate_payment": "/v1/generate-payment",
            "settle_payment": "/v1/settle-payment",
            "health": "/health"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)