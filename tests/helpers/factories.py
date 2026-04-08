"""
Test data factories for creating consistent test data across Python tests
"""
import factory
import json
from decimal import Decimal
from typing import Dict, Any
from datetime import datetime, timezone


class PaymentRequestFactory(factory.Factory):
    """Factory for creating test payment request data"""

    class Meta:
        model = dict

    amount = factory.LazyFunction(lambda: Decimal('0.01'))
    description = factory.Sequence(lambda n: f"Test payment {n}")
    resource = factory.LazyAttribute(lambda obj: f"https://example.com/premium/{obj.description.replace(' ', '_').lower()}")
    merchant_id = factory.Sequence(lambda n: f"merchant_{n}")

    @factory.lazy_attribute
    def payment_id(self):
        """Generate a unique payment ID"""
        return f"test_payment_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"


class WalletFactory(factory.Factory):
    """Factory for creating test wallet data"""

    class Meta:
        model = dict

    name = factory.Sequence(lambda n: f"test_wallet_{n}")
    network = "base-sepolia"
    balance = factory.LazyFunction(lambda: float(Decimal('100.0')))

    @factory.lazy_attribute
    def address(self):
        """Generate a valid-looking Ethereum address"""
        import secrets
        return f"0x{''.join([f'{secrets.randbits(4):x}' for _ in range(40)])}"


class APIKeyFactory(factory.Factory):
    """Factory for creating test API key data"""

    class Meta:
        model = dict

    name = factory.Sequence(lambda n: f"Test API Key {n}")
    active = True

    @factory.lazy_attribute
    def api_key(self):
        """Generate a test API key"""
        import secrets
        return f"sg_test_{''.join([secrets.choice('abcdefghijklmnopqrstuvwxyz0123456789') for _ in range(32)])}"

    @factory.lazy_attribute
    def api_key_hash(self):
        """Generate hash for the API key"""
        return f"hash_{self.api_key}"

    @factory.lazy_attribute
    def user_id(self):
        """Generate a user ID"""
        import uuid
        return str(uuid.uuid4())

    permissions = factory.LazyFunction(lambda: ["generate_payment", "settle_payment"])


class EIP712DomainFactory(factory.Factory):
    """Factory for creating EIP-712 domain data"""

    class Meta:
        model = dict

    name = "SangriaNet"
    version = "1"
    chainId = 84532  # Base Sepolia testnet
    verifyingContract = "0x22A171FAe9957a560B179AD4a87336933b0aEe61"


class EIP712SignatureFactory(factory.Factory):
    """Factory for creating EIP-712 signature test data"""

    class Meta:
        model = dict

    domain = factory.SubFactory(EIP712DomainFactory)

    @factory.lazy_attribute
    def signature(self):
        """Generate a mock signature"""
        import secrets
        return f"0x{''.join([f'{secrets.randbits(4):x}' for _ in range(130)])}"  # 65 bytes * 2 hex chars

    @factory.lazy_attribute
    def payload(self):
        """Generate payload data"""
        wallet = WalletFactory()
        return {
            "from": wallet["address"],
            "to": self.domain["verifyingContract"],
            "value": "10000",  # 0.01 USDC in micro units
            "nonce": str(factory.Faker('random_int', min=1, max=1000).generate())
        }


class FacilitatorResponseFactory(factory.Factory):
    """Factory for creating mock facilitator responses"""

    class Meta:
        model = dict

    @classmethod
    def create_verify_success(cls, payer_address: str = None) -> Dict[str, Any]:
        """Create a successful verification response"""
        if not payer_address:
            wallet = WalletFactory()
            payer_address = wallet["address"]

        return {
            "isValid": True,
            "payer": payer_address,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    @classmethod
    def create_verify_failure(cls, reason: str = "INVALID_SIGNATURE", message: str = "Invalid signature") -> Dict[str, Any]:
        """Create a failed verification response"""
        return {
            "isValid": False,
            "invalidReason": reason,
            "invalidMessage": message
        }

    @classmethod
    def create_settle_success(cls, network: str = "base-sepolia", payer_address: str = None) -> Dict[str, Any]:
        """Create a successful settlement response"""
        if not payer_address:
            wallet = WalletFactory()
            payer_address = wallet["address"]

        import secrets
        transaction_hash = f"0x{''.join([f'{secrets.randbits(4):x}' for _ in range(64)])}"

        return {
            "success": True,
            "transaction": transaction_hash,
            "network": network,
            "payer": payer_address,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    @classmethod
    def create_settle_failure(cls, reason: str = "INSUFFICIENT_FUNDS", message: str = "Insufficient funds") -> Dict[str, Any]:
        """Create a failed settlement response"""
        return {
            "success": False,
            "errorReason": reason,
            "errorMessage": message
        }


def load_fixture_data(filename: str) -> Dict[str, Any]:
    """Load test fixture data from JSON files"""
    import os
    filepath = os.path.join(os.path.dirname(__file__), "..", "fixtures", filename)

    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"Fixture file not found: {filepath}")
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in fixture file {filepath}: {e}")


def create_test_database_state(num_users: int = 3, num_payments: int = 5) -> Dict[str, Any]:
    """Create a consistent test database state"""
    users = []
    api_keys = []
    payments = []
    wallets = []

    for i in range(num_users):
        user_id = f"test_user_{i:03d}"
        users.append({
            "id": user_id,
            "name": f"Test User {i+1}",
            "email": f"test_user_{i}@example.com"
        })

        # Create API key for each user
        api_key_data = APIKeyFactory()
        api_key_data["user_id"] = user_id
        api_keys.append(api_key_data)

        # Create wallet for each user
        wallet_data = WalletFactory()
        wallet_data["user_id"] = user_id
        wallets.append(wallet_data)

    for i in range(num_payments):
        payment_data = PaymentRequestFactory()
        payment_data["user_id"] = users[i % num_users]["id"]
        payments.append(payment_data)

    return {
        "users": users,
        "api_keys": api_keys,
        "wallets": wallets,
        "payments": payments
    }