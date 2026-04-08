#!/usr/bin/env python3
"""
Mock Facilitator Server for X402 Testing

This mock facilitator simulates a real X402 facilitator service for testing purposes.
It provides endpoints for payment verification and settlement that return predictable responses.
"""

import json
import os
import time
from flask import Flask, request, jsonify

app = Flask(__name__)

# Mock responses
MOCK_VERIFY_SUCCESS = {
    "status": "success",
    "message": "Payment verified successfully",
    "verified": True,
    "payer": "0x1234567890123456789012345678901234567890",
    "amount": "10000"
}

MOCK_VERIFY_FAIL_INVALID_SIG = {
    "status": "error",
    "error": "INVALID_SIGNATURE",
    "message": "Invalid signature",
    "verified": False
}

MOCK_SETTLE_SUCCESS = {
    "status": "success",
    "message": "Payment settled successfully",
    "transactionHash": "tx123",
    "settled": True
}

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "service": "mock-facilitator", "timestamp": time.time()})

@app.route('/verify', methods=['POST'])
def verify_payment():
    """Mock payment verification endpoint"""
    try:
        data = request.get_json()

        # Check for invalid signature scenario
        payload = data.get('paymentPayload', {}).get('payload', {})
        authorization = payload.get('authorization', {})

        # Simulate invalid signature check - look for specific test values
        if authorization.get('from') == '0x1234567890123456789012345678901234567890' and 'invalid' in str(data):
            return jsonify(MOCK_VERIFY_FAIL_INVALID_SIG), 400

        # Default success response
        return jsonify(MOCK_VERIFY_SUCCESS), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "error": "INVALID_REQUEST",
            "message": f"Invalid request: {str(e)}"
        }), 400

@app.route('/settle', methods=['POST'])
def settle_payment():
    """Mock payment settlement endpoint"""
    try:
        data = request.get_json()

        # Simulate settlement delay
        time.sleep(0.1)

        # Default success response
        return jsonify(MOCK_SETTLE_SUCCESS), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "error": "SETTLEMENT_FAILED",
            "message": f"Settlement failed: {str(e)}"
        }), 500

@app.route('/timeout', methods=['POST'])
def timeout_endpoint():
    """Endpoint that simulates timeout for testing"""
    time.sleep(10)  # Sleep longer than typical timeout
    return jsonify({"status": "timeout_test"}), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)