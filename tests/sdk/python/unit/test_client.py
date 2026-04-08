import json
import pytest
from unittest.mock import AsyncMock, patch

from sangria_sdk.client import SangriaMerchantClient
from sangria_sdk.models import FixedPriceOptions, PaymentResponse, PaymentProceeded


class TestSangriaMerchantClient:
    @pytest.fixture
    def client(self):
        return SangriaMerchantClient(
            base_url="https://api.test.com",
            api_key="test-api-key"
        )

    @pytest.fixture
    def valid_options(self):
        return FixedPriceOptions(
            price=0.01,
            resource="https://example.com/premium",
            description="Test payment"
        )

    async def test_handle_fixed_price_without_payment_header(self, client, valid_options):
        """Test payment generation when no payment header is provided"""
        mock_response = {"challenge": "test-challenge", "amount": 0.01}

        with patch.object(client._http, 'post_json', return_value=mock_response):
            result = await client.handle_fixed_price(None, valid_options)

        assert isinstance(result, PaymentResponse)
        assert result.status_code == 402
        assert result.body == mock_response
        assert "PAYMENT-REQUIRED" in result.headers

    async def test_handle_fixed_price_with_valid_payment_header(self, client, valid_options):
        """Test payment settlement with valid payment header"""
        mock_response = {
            "success": True,
            "transaction": "tx123"
        }

        with patch.object(client._http, 'post_json', return_value=mock_response):
            result = await client.handle_fixed_price("valid-payment-header", valid_options)

        assert isinstance(result, PaymentProceeded)
        assert result.paid is True
        assert result.amount == 0.01
        assert result.transaction == "tx123"

    async def test_handle_fixed_price_with_invalid_payment_header(self, client, valid_options):
        """Test payment settlement with invalid payment header"""
        mock_response = {
            "success": False,
            "error_message": "Invalid payment",
            "error_reason": "INVALID_SIGNATURE"
        }

        with patch.object(client._http, 'post_json', return_value=mock_response):
            result = await client.handle_fixed_price("invalid-payment-header", valid_options)

        assert isinstance(result, PaymentResponse)
        assert result.status_code == 402
        assert result.body["error"] == "Invalid payment"
        assert result.body["error_reason"] == "INVALID_SIGNATURE"

    async def test_generate_payment_api_error(self, client, valid_options):
        """Test graceful handling of API errors during payment generation"""
        with patch.object(client._http, 'post_json', side_effect=Exception("API Error")):
            result = await client.handle_fixed_price(None, valid_options)

        assert isinstance(result, PaymentResponse)
        assert result.status_code == 500
        assert result.body == {"error": "Payment service unavailable"}

    async def test_settle_payment_api_error(self, client, valid_options):
        """Test graceful handling of API errors during payment settlement"""
        with patch.object(client._http, 'post_json', side_effect=Exception("Network Error")):
            result = await client.handle_fixed_price("test-payment-header", valid_options)

        assert isinstance(result, PaymentResponse)
        assert result.status_code == 500
        assert result.body == {"error": "Payment settlement failed"}

    async def test_generate_payment_encoding(self, client, valid_options):
        """Test that payment challenge is properly base64 encoded"""
        mock_response = {"challenge": "test-challenge"}

        with patch.object(client._http, 'post_json', return_value=mock_response):
            result = await client.handle_fixed_price(None, valid_options)

        assert isinstance(result, PaymentResponse)

        # Decode the header and verify it matches the response
        import base64
        encoded_header = result.headers["PAYMENT-REQUIRED"]
        decoded = json.loads(base64.b64decode(encoded_header).decode())
        assert decoded == mock_response

    async def test_client_initialization(self):
        """Test client initialization with custom parameters"""
        client = SangriaMerchantClient(
            base_url="https://custom.api.com",
            api_key="custom-key",
            generate_endpoint="/custom/generate",
            settle_endpoint="/custom/settle",
            timeout_seconds=10.0
        )

        assert client.generate_endpoint == "/custom/generate"
        assert client.settle_endpoint == "/custom/settle"

    async def test_aclose(self, client):
        """Test client cleanup"""
        with patch.object(client._http, 'close', new_callable=AsyncMock) as mock_close:
            await client.aclose()
            mock_close.assert_called_once()


class TestFixedPriceOptions:
    def test_valid_price_options(self):
        """Test creating valid price options"""
        options = FixedPriceOptions(
            price=0.01,
            resource="https://example.com/premium",
            description="Test payment"
        )
        assert options.price == 0.01
        assert options.resource == "https://example.com/premium"
        assert options.description == "Test payment"

    def test_invalid_price_zero(self):
        """Test that zero price raises ValueError"""
        with pytest.raises(ValueError, match="price must be a finite number greater than 0"):
            FixedPriceOptions(price=0, resource="https://example.com/premium")

    def test_invalid_price_negative(self):
        """Test that negative price raises ValueError"""
        with pytest.raises(ValueError, match="price must be a finite number greater than 0"):
            FixedPriceOptions(price=-0.01, resource="https://example.com/premium")

    def test_invalid_price_infinite(self):
        """Test that infinite price raises ValueError"""
        with pytest.raises(ValueError, match="price must be a finite number greater than 0"):
            FixedPriceOptions(price=float('inf'), resource="https://example.com/premium")

    def test_invalid_price_nan(self):
        """Test that NaN price raises ValueError"""
        with pytest.raises(ValueError, match="price must be a finite number greater than 0"):
            FixedPriceOptions(price=float('nan'), resource="https://example.com/premium")

    def test_to_generate_dict_with_description(self):
        """Test serialization to dict with description"""
        options = FixedPriceOptions(
            price=0.01,
            resource="https://example.com/premium",
            description="Test payment"
        )
        result = options.to_generate_dict()

        expected = {
            "amount": 0.01,
            "resource": "https://example.com/premium",
            "description": "Test payment"
        }
        assert result == expected

    def test_to_generate_dict_without_description(self):
        """Test serialization to dict without description"""
        options = FixedPriceOptions(
            price=0.01,
            resource="https://example.com/premium"
        )
        result = options.to_generate_dict()

        expected = {
            "amount": 0.01,
            "resource": "https://example.com/premium"
        }
        assert result == expected