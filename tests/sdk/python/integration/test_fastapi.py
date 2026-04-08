import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from sangria_sdk.client import SangriaMerchantClient
from sangria_sdk.adapters.fastapi import require_sangria_payment


class TestFastAPIAdapter:
    @pytest.fixture
    def client(self):
        return SangriaMerchantClient(
            base_url="https://api.test.com",
            api_key="test-api-key"
        )

    @pytest.fixture
    def app(self, client):
        app = FastAPI()

        @app.get("/premium")
        @require_sangria_payment(client, amount=0.01, description="Premium content")
        async def premium(request: Request):
            payment = getattr(request.state, 'sangria_payment', None)
            return {"message": "success", "payment": payment}

        @app.get("/bypass")
        @require_sangria_payment(
            client,
            amount=0.01,
            bypass_if=lambda req: req.headers.get("x-bypass") == "true"
        )
        async def bypass_endpoint(request: Request):
            return {"message": "bypassed"}

        return app

    @pytest.fixture
    def test_client(self, app):
        return TestClient(app)

    def test_returns_402_when_no_payment_header(self, test_client, client):
        """Test that 402 is returned when no payment header is provided"""
        with patch.object(client._http, 'post_json', new_callable=AsyncMock) as mock_post:
            mock_post.return_value = {"challenge": "test-challenge", "amount": 0.01}

            response = test_client.get("/premium")

            assert response.status_code == 402
            assert "PAYMENT-REQUIRED" in response.headers
            assert response.json() == {"challenge": "test-challenge", "amount": 0.01}

    def test_proceeds_with_valid_payment_header(self, test_client, client):
        """Test that handler proceeds when valid payment is provided"""
        with patch.object(client._http, 'post_json', new_callable=AsyncMock) as mock_post:
            mock_post.return_value = {
                "success": True,
                "transaction": "tx123"
            }

            response = test_client.get(
                "/premium",
                headers={"PAYMENT-SIGNATURE": "valid-payment-header"}
            )

            assert response.status_code == 200
            response_data = response.json()
            assert response_data["message"] == "success"
            assert response_data["payment"]["paid"] is True
            assert response_data["payment"]["amount"] == 0.01
            assert response_data["payment"]["transaction"] == "tx123"

    def test_handles_invalid_payment_header(self, test_client, client):
        """Test handling of invalid payment header"""
        with patch.object(client._http, 'post_json', new_callable=AsyncMock) as mock_post:
            mock_post.return_value = {
                "success": False,
                "error_message": "Invalid signature",
                "error_reason": "INVALID_SIGNATURE"
            }

            response = test_client.get(
                "/premium",
                headers={"PAYMENT-SIGNATURE": "invalid-payment-header"}
            )

            assert response.status_code == 402
            assert response.json() == {
                "error": "Invalid signature",
                "error_reason": "INVALID_SIGNATURE"
            }

    def test_bypass_payment_when_configured(self, test_client, client):
        """Test payment bypass functionality"""
        response = test_client.get(
            "/bypass",
            headers={"x-bypass": "true"}
        )

        assert response.status_code == 200
        assert response.json() == {"message": "bypassed"}

    def test_no_bypass_without_header(self, test_client, client):
        """Test that bypass doesn't work without proper header"""
        with patch.object(client._http, 'post_json', new_callable=AsyncMock) as mock_post:
            mock_post.return_value = {"challenge": "test-challenge"}

            response = test_client.get("/bypass")

            assert response.status_code == 402

    def test_constructs_correct_resource_url(self, test_client, client):
        """Test that resource URL is constructed correctly"""
        captured_options = None

        async def capture_options(*args, **kwargs):
            nonlocal captured_options
            captured_options = kwargs.get('options')
            return {"challenge": "test-challenge"}

        with patch.object(client, 'handle_fixed_price', side_effect=capture_options):
            test_client.get("/premium?param=value")

            assert captured_options is not None
            assert "premium?param=value" in captured_options.resource

    def test_handles_api_errors_gracefully(self, test_client, client):
        """Test graceful handling of API errors"""
        with patch.object(client._http, 'post_json', side_effect=Exception("API Error")):
            response = test_client.get("/premium")

            assert response.status_code == 500
            assert response.json() == {"error": "Payment service unavailable"}

    def test_settlement_api_error(self, test_client, client):
        """Test graceful handling of settlement API errors"""
        with patch.object(client._http, 'post_json', side_effect=Exception("Network Error")):
            response = test_client.get(
                "/premium",
                headers={"PAYMENT-SIGNATURE": "test-payment-header"}
            )

            assert response.status_code == 500
            assert response.json() == {"error": "Payment settlement failed"}

    def test_decorator_with_request_as_kwarg(self, client):
        """Test decorator works when request is passed as keyword argument"""
        app = FastAPI()

        @app.get("/test")
        @require_sangria_payment(client, amount=0.01)
        async def test_endpoint(request: Request):
            return {"message": "success"}

        test_client = TestClient(app)

        with patch.object(client._http, 'post_json', new_callable=AsyncMock) as mock_post:
            mock_post.return_value = {"challenge": "test-challenge"}

            response = test_client.get("/test")
            assert response.status_code == 402

    def test_missing_request_raises_error(self, client):
        """Test that missing request object raises appropriate error"""
        @require_sangria_payment(client, amount=0.01)
        async def invalid_handler():
            return {"message": "should not reach here"}

        # This would be called directly without FastAPI context
        with pytest.raises(Exception):
            # In real FastAPI, this would be an HTTPException with status 500
            asyncio.run(invalid_handler())

    def test_payment_amount_validation(self, client):
        """Test that invalid payment amounts are rejected"""
        app = FastAPI()

        with pytest.raises(ValueError, match="price must be a finite number greater than 0"):
            @app.get("/invalid")
            @require_sangria_payment(client, amount=0)  # Invalid amount
            async def invalid_endpoint(request: Request):
                return {"message": "should not reach here"}