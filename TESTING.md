# Sangria.NET Comprehensive Testing Guide

**Technical documentation for the complete testing infrastructure, architecture, and implementation details.**

## Quick Start

**Fast Development Tests** (2-3 minutes):
```bash
./scripts/test-dev.sh
```

**Manual Component Testing**:
```bash
# Backend Go tests
cd backend && go test ../tests/backend/unit/... -v

# TypeScript SDK tests
cd sdk/sdk-typescript && pnpm exec vitest run ../../tests/sdk/typescript/

# Python SDK tests
cd sdk/python && pytest ../../tests/sdk/python/ -v
```

**Comprehensive Pre-Commit** (8-12 minutes):
```bash
./scripts/test-pre-commit.sh
```

> 📖 **For quick daily usage**: Use commands above
> 📋 **For implementation details**: Continue reading below

---

## Testing Philosophy & Architecture

### **Failure-Driven Testing Approach**

We prioritize testing **real production failure scenarios** over achieving arbitrary coverage metrics. This approach focuses on the 20% of tests that prevent 80% of production failures.

#### **Testing Hierarchy**
```
Critical Path Tests (High Priority)
├── Payment flow state machines
├── Database consistency under load
├── Network partition recovery
├── Security vulnerabilities (EIP-712, API keys)
└── Framework adapter compatibility

Standard Tests (Lower Priority)
├── Unit tests for pure functions
├── Happy path validation
└── Code coverage metrics
```

### **Component Architecture**

| Component | Language | Test Framework | Test Location | Focus Areas |
|-----------|----------|---------------|---------------|-------------|
| **Backend API** | Go | `testing` + `testify` | `tests/backend/` | Payment orchestration, DB ops |
| **TypeScript SDK** | TypeScript | `vitest` | `tests/sdk/typescript/` | Framework adapters, HTTP client |
| **Python SDK** | Python | `pytest` | `tests/sdk/python/` | FastAPI integration, async patterns |
| **End-to-End Tests** | Mixed | Custom harness | `tests/e2e/` | Cross-component flows |
| **Shared Test Infrastructure** | Mixed | Custom | `tests/helpers/` | Fixtures, mocks, utilities |
| **Chaos Tests** | Docker + Scripts | `toxiproxy` + `stress` | `tests/backend/chaos/` | Failure injection |

---

## Testing Infrastructure

### **Docker Test Environment**

```yaml
# docker-compose.test.yml
services:
  postgres-test:
    image: postgres:15-alpine
    ports: ["5433:5432"]  # Non-conflicting port
    tmpfs: ["/var/lib/postgresql/data"]  # In-memory for speed
    command: postgres -c fsync=off -c synchronous_commit=off

  redis:
    image: redis:7-alpine
    ports: ["6380:6379"]  # Non-conflicting port
    command: redis-server --appendonly no --save ""

  toxiproxy:
    image: ghcr.io/shopify/toxiproxy:2.5.0
    ports: ["8474:8474", "5432:5432", "6379:6379", "8081:8081"]
    command: -host=0.0.0.0
```

**Infrastructure Design Decisions:**
- **tmpfs for PostgreSQL**: Eliminates disk I/O, 10x faster test execution
- **Optimized PostgreSQL settings**: Disables durability features for test speed
- **Non-conflicting ports**: Avoids interference with local development services
- **Toxiproxy integration**: Enables network failure injection for chaos testing

### **Test Script Architecture**

```bash
scripts/
├── test-setup.sh       # One-time environment setup
├── test-dev.sh         # Fast feedback loop (2-3 min)
├── test-pre-commit.sh  # Comprehensive validation (8-12 min)
└── test-release.sh     # Production readiness + chaos (20-30 min)
```

#### **Script Design Patterns**

**Parallel Execution**:
```bash
# test-dev.sh implementation
{
    cd backend && go test -short -race ./... &
} &
{
    cd sdk/sdk-typescript && npm test -- --run --reporter=basic &
} &
{
    cd sdk/python && pytest tests/unit/ -x --tb=short &
} &
wait  # Wait for all parallel processes
```

**Error Aggregation**:
```bash
# test-pre-commit.sh pattern
FAILED_TESTS=()
add_failure() { FAILED_TESTS+=("$1"); }

# Run tests, capture failures
go test ./... || add_failure "Backend tests"
npm test || add_failure "TypeScript tests"

# Report aggregated results
if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo "✅ All tests passed"
else
    echo "❌ Failed: ${FAILED_TESTS[*]}"
fi
```

---

## Test Categories & Implementation

### **Unit Testing**

#### **Backend Unit Tests (Go)**
```bash
# Location: tests/backend/unit/
# Framework: Go testing + testify
# Execution: cd backend && go test ../tests/backend/unit/... -v

# Example test structure:
func TestPaymentGeneration(t *testing.T) {
    tests := []struct {
        name     string
        amount   float64
        expected PaymentStatus
        wantErr  bool
    }{
        {"valid_payment", 0.01, StatusPending, false},
        {"zero_amount", 0.00, StatusInvalid, true},
        {"negative_amount", -0.01, StatusInvalid, true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, err := GeneratePayment(tt.amount)
            if tt.wantErr {
                assert.Error(t, err)
            } else {
                assert.NoError(t, err)
                assert.Equal(t, tt.expected, result.Status)
            }
        })
    }
}
```

#### **TypeScript SDK Unit Tests (Vitest)**
```typescript
// Location: tests/sdk/typescript/unit/
// Framework: Vitest + supertest
// Execution: cd sdk/sdk-typescript && pnpm exec vitest run ../../tests/sdk/typescript/unit/

// Example test structure:
describe('SangriaNet Core', () => {
  beforeEach(() => {
    // Setup MSW mocks for HTTP client testing
    server.use(
      http.post('/v1/generate-payment', () => {
        return HttpResponse.json({
          payment_id: 'test_payment_123',
          eip712: { domain: 'test' }
        })
      })
    )
  })

  it('should generate valid payment terms', async () => {
    const sangria = new SangriaNet({ apiKey: 'test_key' })
    const result = await sangria.generatePaymentTerms({
      amount: 0.01,
      description: 'Test payment'
    })

    expect(result.payment_id).toBe('test_payment_123')
    expect(result.eip712).toBeDefined()
  })
})
```

#### **Python SDK Unit Tests (pytest)**
```python
# Location: tests/sdk/python/unit/
# Framework: pytest + respx
# Execution: cd sdk/python && pytest ../../tests/sdk/python/unit/

import pytest
import respx
from sangria_sdk import SangriaMerchantClient

class TestSangriaMerchantClient:
    @pytest.fixture
    def client(self):
        return SangriaMerchantClient(api_key="test_key")

    @respx.mock
    async def test_generate_payment_terms(self, client):
        respx.post("http://api.sangria.net/v1/generate-payment").mock(
            return_value=httpx.Response(200, json={
                "payment_id": "test_payment_123",
                "eip712": {"domain": "test"}
            })
        )

        result = await client.generate_payment_terms(
            amount=0.01,
            description="Test payment"
        )

        assert result.payment_id == "test_payment_123"
        assert result.eip712 is not None
```

### **Integration Testing**

#### **SDK-to-Backend Integration**
```typescript
// Location: tests/sdk/typescript/integration/
// Tests cross-service communication with real backend

describe('SDK-Backend Integration', () => {
  let backend: BackendTestServer
  let sdk: SangriaNet

  beforeAll(async () => {
    // Start actual backend instance for integration testing
    backend = await startBackendTestServer()
    sdk = new SangriaNet({
      apiKey: 'test_key',
      baseUrl: backend.url
    })
  })

  it('should complete full payment cycle', async () => {
    // Generate payment terms
    const terms = await sdk.generatePaymentTerms({
      amount: 0.01,
      description: 'Integration test'
    })

    // Validate EIP-712 structure
    expect(terms.eip712.domain.name).toBe('SangriaNet')
    expect(terms.eip712.domain.chainId).toBeOneOf([1, 8453, 84532])

    // Mock signature and settle payment
    const mockSignature = createMockEIP712Signature(terms.eip712)
    const settlement = await sdk.settlePayment({
      signature: mockSignature,
      payment_id: terms.payment_id
    })

    expect(settlement.success).toBe(true)
    expect(settlement.transaction_hash).toMatch(/^0x[a-fA-F0-9]{64}$/)
  })
})
```

### **Chaos Engineering Implementation**

#### **Database Connection Chaos**
```bash
# Located in: tests/backend/chaos/
# test-release.sh chaos implementation

# Setup database proxy for failure injection
toxiproxy-cli create postgres-proxy -l localhost:5432 -u localhost:5433

# Test 1: Latency injection
toxiproxy-cli toxic add --toxicity=0.5 --type=latency \
  --attribute=latency=2000 postgres-proxy

# Test 2: Connection timeouts
toxiproxy-cli toxic add --toxicity=0.3 --type=timeout \
  --attribute=timeout=1000 postgres-proxy

# Verify system behavior under database stress
# Expected: Graceful degradation, proper error handling, recovery
```

#### **Network Partition Testing**
```bash
# Simulate complete network isolation to facilitator
toxiproxy-cli toxic add --toxicity=1.0 --type=timeout \
  --attribute=timeout=0 facilitator-proxy

# Generate payment load during partition
for i in {1..20}; do
    curl -X POST http://localhost:8080/v1/generate-payment \
         -d '{"amount": 0.01}' &
done

# Expected outcomes:
# 1. Clear error messages (not hanging)
# 2. No money lost in limbo state
# 3. Graceful recovery after partition heals
```

#### **Concurrent Payment Stress Testing**
```go
// tests/backend/chaos/concurrent_payments_test.go
func TestConcurrentPaymentStress(t *testing.T) {
    const (
        walletCount = 100
        paymentCount = 200
        initialBalance = 0.10
    )

    // Setup wallets with known balances
    wallets := setupWallets(t, walletCount, initialBalance)

    // Launch over-subscribed payment requests
    var wg sync.WaitGroup
    results := make(chan PaymentResult, paymentCount)

    for i := 0; i < paymentCount; i++ {
        wg.Add(1)
        go func(paymentIndex int) {
            defer wg.Done()

            wallet := wallets[paymentIndex % walletCount]
            result := ProcessPayment(PaymentRequest{
                WalletAddress: wallet.Address,
                Amount:        0.01,
                Description:   fmt.Sprintf("stress-test-%d", paymentIndex),
            })

            results <- result
        }(i)
    }

    wg.Wait()
    close(results)

    // Analyze results for race conditions
    var successes, failures int
    for result := range results {
        if result.Success {
            successes++
        } else {
            failures++
        }
    }

    // Verify database consistency
    verifyWalletBalances(t, wallets)
    verifyDoubleEntryAccounting(t)
    verifyNoOrphanedTransactions(t)
}
```

---

## Security Testing Implementation

### **EIP-712 Signature Validation**
```typescript
// tests/security/eip712-security.test.ts
describe('EIP-712 Security Validation', () => {
  it('should reject cross-network signature replay', async () => {
    // Generate payment on Base Mainnet (chain ID 8453)
    const mainnetPayment = await generatePayment(0.01, { chainId: 8453 })
    const mainnetSignature = await signEIP712(mainnetPayment.eip712Domain, {
      chainId: 8453,
      privateKey: TEST_PRIVATE_KEY
    })

    // Switch to Base Sepolia (chain ID 84532)
    mockNetwork({ chainId: 84532 })

    // Attempt to use mainnet signature on testnet
    const result = await settlePayment(mainnetPayment.id, mainnetSignature)

    // Should reject due to domain separator mismatch
    expect(result.status).toBe('FAILED')
    expect(result.error).toBe('INVALID_CHAIN_ID')

    // Verify no state changes occurred
    const payment = await getPaymentFromDB(mainnetPayment.id)
    expect(payment.state).toBe('PENDING')
  })

  it('should prevent signature replay attacks', async () => {
    const payment = await generatePayment(0.01)
    const signature = await signPayment(payment)

    // First use should succeed
    const result1 = await settlePayment(payment.id, signature)
    expect(result1.status).toBe('SUCCESS')

    // Second use should fail (replay attack)
    const result2 = await settlePayment(payment.id, signature)
    expect(result2.status).toBe('FAILED')
    expect(result2.error).toBe('SIGNATURE_ALREADY_USED')
  })
})
```

### **API Security Testing**
```go
// tests/backend/security/api_security_test.go
func TestAPISecurityValidation(t *testing.T) {
    tests := []struct {
        name           string
        apiKey         string
        expectedStatus int
        description    string
    }{
        {
            name:           "valid_api_key",
            apiKey:         "sg_test_valid_key_123",
            expectedStatus: 200,
            description:    "Valid API key should allow access",
        },
        {
            name:           "invalid_api_key",
            apiKey:         "sg_test_invalid_key",
            expectedStatus: 401,
            description:    "Invalid API key should be rejected",
        },
        {
            name:           "malformed_api_key",
            apiKey:         "not_a_valid_format",
            expectedStatus: 401,
            description:    "Malformed API key should be rejected",
        },
        {
            name:           "missing_api_key",
            apiKey:         "",
            expectedStatus: 401,
            description:    "Missing API key should be rejected",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            req := httptest.NewRequest("POST", "/v1/generate-payment", strings.NewReader(`{"amount": 0.01}`))
            req.Header.Set("Content-Type", "application/json")
            req.Header.Set("Authorization", "Bearer "+tt.apiKey)

            recorder := httptest.NewRecorder()
            handler.ServeHTTP(recorder, req)

            assert.Equal(t, tt.expectedStatus, recorder.Code, tt.description)
        })
    }
}
```

---

## Performance Testing & Benchmarking

### **Load Testing Implementation**
```javascript
// tests/backend/performance/payment_load_test.js (K6)
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 500 },   // Stay at 500 users
    { duration: '2m', target: 1000 },  // Ramp to 1000 users
    { duration: '5m', target: 1000 },  // Stay at 1000 users
    { duration: '2m', target: 0 },     // Scale down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],     // 95% of requests under 500ms
    'http_req_duration{payment:settlement}': ['p(95)<2000'], // Settlement under 2s
    'http_req_failed': ['rate<0.01'],       // Error rate under 1%
  },
};

export default function() {
  // Test payment generation
  let paymentResponse = http.post(`${__ENV.BACKEND_URL}/v1/generate-payment`, {
    amount: 0.01,
    description: 'Load test payment'
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.API_KEY}`
    },
    tags: { payment: 'generation' }
  });

  check(paymentResponse, {
    'payment generation status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'payment_id present': (r) => JSON.parse(r.body).payment_id !== undefined,
  });

  if (paymentResponse.status === 200) {
    let paymentData = JSON.parse(paymentResponse.body);

    // Test payment settlement
    let settlementResponse = http.post(`${__ENV.BACKEND_URL}/v1/settle-payment`, {
      payment_id: paymentData.payment_id,
      signature: generateMockSignature(paymentData.eip712)
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${__ENV.API_KEY}`
      },
      tags: { payment: 'settlement' }
    });

    check(settlementResponse, {
      'settlement status is 200': (r) => r.status === 200,
      'settlement time < 2000ms': (r) => r.timings.duration < 2000,
    });
  }

  sleep(1);
}
```

### **Go Benchmarking**
```go
// tests/backend/performance/payment_bench_test.go
func BenchmarkPaymentGeneration(b *testing.B) {
    // Setup test database and dependencies
    db := setupTestDB(b)
    defer db.Close()

    handler := NewPaymentHandler(db)

    // Benchmark payment generation
    b.ResetTimer()
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            payment, err := handler.GeneratePayment(PaymentRequest{
                Amount:      0.01,
                Description: "benchmark test",
            })
            if err != nil {
                b.Fatal(err)
            }
            if payment.ID == "" {
                b.Fatal("payment ID should not be empty")
            }
        }
    })
}

func BenchmarkDatabaseOperations(b *testing.B) {
    benchmarks := []struct {
        name string
        fn   func(*testing.B, *sql.DB)
    }{
        {"InsertPayment", benchmarkInsertPayment},
        {"UpdatePaymentStatus", benchmarkUpdatePaymentStatus},
        {"GetPaymentByID", benchmarkGetPaymentByID},
        {"ListPaymentsByMerchant", benchmarkListPayments},
    }

    db := setupTestDB(b)
    defer db.Close()

    for _, bm := range benchmarks {
        b.Run(bm.name, func(b *testing.B) {
            bm.fn(b, db)
        })
    }
}
```

---

## CI/CD Integration

### **GitHub Actions Workflow**
```yaml
# .github/workflows/tests.yml
name: Tests

on:
  push:
    branches: [ main, dev ]
  pull_request:
    branches: [ main, dev ]

jobs:
  fast-tests:
    name: Fast Tests (Pre-Commit)
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request' || (github.event_name == 'push' && github.ref != 'refs/heads/main')

    steps:
      - uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v4
        with:
          go-version: '1.23'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Setup testing environment
        run: ./scripts/test-setup.sh

      - name: Run pre-commit tests
        run: ./scripts/test-pre-commit.sh

      - name: Upload coverage reports
        uses: codecov/codecov-action@v4
        with:
          files: ./backend/coverage.out,./sdk/sdk-typescript/coverage/lcov.info
          flags: fast-tests

  full-tests:
    name: Full Tests (Release Validation)
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      # ... setup steps same as above ...

      - name: Run full release tests
        run: ./scripts/test-release.sh

      - name: Upload security scan results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: backend/gosec-report.json

  compatibility:
    name: Cross-Platform Compatibility
    runs-on: ${{ matrix.os }}
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        go-version: [1.21, 1.22, 1.23]
        node-version: [18, 20, 22]
        python-version: ['3.10', '3.11', '3.12']

    steps:
      - uses: actions/checkout@v4

      - name: Setup Go ${{ matrix.go-version }}
        uses: actions/setup-go@v4
        with:
          go-version: ${{ matrix.go-version }}

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - name: Setup Python ${{ matrix.python-version }}
        uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python-version }}

      - name: Run compatibility tests
        run: |
          ./scripts/test-setup.sh
          ./scripts/test-dev.sh
```

---

## Test Data Management

### **Shared Test Infrastructure**

#### **Centralized Test Directory Structure**
```
tests/                         # All tests in one place (NEW!)
├── backend/                   # Go backend tests
│   ├── unit/                  # Backend unit tests
│   ├── integration/           # Backend integration tests
│   ├── security/              # Security-specific tests
│   ├── performance/           # Performance benchmarks
│   ├── chaos/                 # Chaos engineering tests
│   └── testutils/             # Go test utilities
├── sdk/                       # SDK tests
│   ├── python/                # Python SDK tests
│   │   ├── unit/              # Python unit tests
│   │   └── integration/       # Python integration tests
│   └── typescript/            # TypeScript SDK tests
│       ├── unit/              # TypeScript unit tests
│       └── integration/       # TypeScript integration tests
├── e2e/                       # End-to-end integration tests
├── helpers/                   # Shared test utilities
│   ├── test-setup.go          # Go test environment setup
│   ├── assertions.ts          # TypeScript custom assertions
│   └── factories.py           # Python test data factories
├── fixtures/                  # Static test data
│   ├── payments.json          # Payment test cases
│   ├── wallets.json           # Wallet configurations
│   ├── api-keys.json          # API key test data
│   └── eip712-signatures.json # EIP-712 signature examples
└── mocks/                     # Mock responses
    ├── facilitator-responses/ # Mock CDP facilitator responses
    ├── database-states/       # Database snapshot data
    └── network-scenarios/     # Network failure scenarios
```

#### **Shared Test Infrastructure Usage**

**Fixtures**: Static test data used across all components
```bash
# Load payment test cases from centralized location
tests/fixtures/payments.json    # Valid/invalid payment scenarios
tests/fixtures/wallets.json     # Test wallet configurations
tests/fixtures/api-keys.json    # API key test data
tests/fixtures/eip712-signatures.json # EIP-712 signature examples
```

**Helpers**: Reusable test utilities
```bash
tests/helpers/test-setup.go     # Database setup for Go tests
tests/helpers/assertions.ts     # Custom assertions for TS tests
tests/helpers/factories.py      # Test data generators for Python
```

**Benefits of Centralized Structure:**
- Single source of truth for all tests
- Easier to find and maintain test files
- Better organization and consistency
- Simplified CI/CD pipeline configuration
- Reduced duplication of test utilities

### **Test Data Factories**
```python
# tests/helpers/factories.py
import factory
from decimal import Decimal

class PaymentRequestFactory(factory.Factory):
    class Meta:
        model = PaymentRequest

    amount = factory.LazyFunction(lambda: Decimal('0.01'))
    description = factory.Sequence(lambda n: f"Test payment {n}")
    merchant_id = factory.Sequence(lambda n: f"merchant_{n}")

    @factory.lazy_attribute
    def wallet_address(self):
        return f"0x{''.join([f'{i:02x}' for i in range(20)])}"

class EIP712DomainFactory(factory.Factory):
    class Meta:
        model = EIP712Domain

    name = "SangriaNet"
    version = "1"
    chainId = 8453  # Base mainnet
    verifyingContract = "0x1234567890123456789012345678901234567890"
```

---

## Troubleshooting & Debugging

### **Common Test Failures**

#### **Database Connection Issues**
```bash
# Symptoms: Tests hang or fail with connection errors
# Solution: Reset test database
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d postgres-test

# Verify database connectivity
docker-compose -f docker-compose.test.yml exec postgres-test \
  pg_isready -U test -d sangria_test
```

#### **Port Conflicts**
```bash
# Symptoms: "Port already in use" errors
# Solution: Clean up conflicting processes
lsof -ti:5433 | xargs kill  # Kill processes on test PostgreSQL port
lsof -ti:6380 | xargs kill  # Kill processes on test Redis port

# Alternative: Use different ports in docker-compose.test.yml
```

#### **Memory Issues During Tests**
```bash
# Symptoms: Out of memory errors, slow test execution
# Solution: Increase Docker memory limits or disable memory-intensive tests

# Temporary: Skip memory pressure tests
export SKIP_MEMORY_TESTS=true
./scripts/test-release.sh

# Permanent: Increase Docker Desktop memory to 4GB+
```

### **Debugging Test Failures**

#### **Go Test Debugging**
```bash
# Run all backend tests
cd backend && go test ./tests/... -v

# Run specific test category with race detection
cd backend && go test -race -short ./tests/unit -v

# Run performance benchmarks
cd backend && go test -bench=. ./tests/performance -v

# Generate CPU profile for performance debugging
cd backend && go test -cpuprofile=cpu.prof -bench=. ./tests/performance/
```

#### **TypeScript Test Debugging**
```bash
# Run with debug output
cd sdk/sdk-typescript && pnpm exec vitest run --reporter=verbose

# Run specific test file
cd sdk/sdk-typescript && pnpm exec vitest run tests/unit/core.test.ts

# Run tests in watch mode for development
cd sdk/sdk-typescript && pnpm exec vitest

# Debug with Node.js inspector
cd sdk/sdk-typescript && pnpm exec vitest run --inspect-brk tests/unit/core.test.ts
```

#### **Python Test Debugging**
```bash
# Run with detailed output
pytest tests/ -v -s

# Run specific test with debugger
pytest tests/unit/test_client.py::TestSangriaMerchantClient::test_generate_payment_terms -s --pdb

# Generate coverage report
pytest tests/ --cov=src --cov-report=html
```

---

## Performance Baselines & SLAs

### **Response Time Requirements**
| Operation | Target (P95) | Maximum (P99) | Measured With |
|-----------|--------------|---------------|----------------|
| Payment Generation | < 500ms | < 1000ms | K6 load tests |
| Payment Settlement | < 2000ms | < 5000ms | K6 load tests |
| Database Query | < 100ms | < 200ms | Go benchmarks |
| SDK HTTP Client | < 300ms | < 600ms | Vitest integration |

### **Throughput Requirements**
| Component | Target | Sustained | Peak |
|-----------|--------|-----------|------|
| Backend API | 100 req/sec | 1 hour | 1000 req/sec |
| PostgreSQL | 1000 queries/sec | 1 hour | 5000 queries/sec |
| Memory Usage | < 512MB | Under load | < 1GB |

### **Reliability Targets**
- **Uptime**: 99.9% (measured by health checks)
- **Payment Success Rate**: 99.5% (under normal load)
- **Error Recovery**: < 30 seconds (after failure resolution)
- **Data Consistency**: 100% (no tolerance for data corruption)

---

This comprehensive testing guide provides the technical foundation for understanding, maintaining, and extending the Sangria.NET testing infrastructure. For daily usage, refer to the [Quick Testing Guide](QUICK_TESTING_GUIDE.md).