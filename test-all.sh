#!/bin/bash

# Comprehensive Test Runner for Sangria Network
# Runs SDK tests, backend tests, and integration tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export TEST_START_TIME=$(date +%s)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
SKIP_SDK_TESTS=${SKIP_SDK_TESTS:-false}
SKIP_BACKEND_TESTS=${SKIP_BACKEND_TESTS:-false}
SKIP_INTEGRATION_TESTS=${SKIP_INTEGRATION_TESTS:-false}
SKIP_CHAOS_TESTS=${SKIP_CHAOS_TESTS:-true}
PARALLEL_TESTS=${PARALLEL_TESTS:-false}

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

run_test_suite() {
    local name="$1"
    local command="$2"
    local start_time=$(date +%s)

    log "Starting $name..."

    if eval "$command"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        success "$name completed in ${duration}s"
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        error "$name failed after ${duration}s"
        return 1
    fi
}

setup_environment() {
    log "Setting up test environment..."

    # Create test directories if they don't exist
    mkdir -p "$SCRIPT_DIR/test-results"
    mkdir -p "$SCRIPT_DIR/coverage-reports"

    # Set environment variables for testing
    export NODE_ENV=test
    export POSTGRES_URL="postgres://testuser:testpass@localhost:5432/testdb"
    export X402_FACILITATOR_URL="https://api.x402.org"

    success "Environment setup complete"
}

run_sdk_tests() {
    if [ "$SKIP_SDK_TESTS" = "true" ]; then
        warn "Skipping SDK tests (SKIP_SDK_TESTS=true)"
        return 0
    fi

    local failed_tests=()

    # TypeScript SDK tests
    if run_test_suite "TypeScript SDK Tests" "cd '$SCRIPT_DIR/sdk/sdk-typescript' && ./test.sh"; then
        success "TypeScript SDK tests passed"
    else
        failed_tests+=("TypeScript SDK")
    fi

    # Python SDK tests
    if run_test_suite "Python SDK Tests" "cd '$SCRIPT_DIR/sdk/python' && ./test.sh"; then
        success "Python SDK tests passed"
    else
        failed_tests+=("Python SDK")
    fi

    if [ ${#failed_tests[@]} -eq 0 ]; then
        success "All SDK tests passed"
        return 0
    else
        error "SDK tests failed: ${failed_tests[*]}"
        return 1
    fi
}

run_backend_tests() {
    if [ "$SKIP_BACKEND_TESTS" = "true" ]; then
        warn "Skipping backend tests (SKIP_BACKEND_TESTS=true)"
        return 0
    fi

    if run_test_suite "Backend Go Tests" "cd '$SCRIPT_DIR/backend' && ./test.sh"; then
        success "Backend tests passed"
        return 0
    else
        error "Backend tests failed"
        return 1
    fi
}

run_integration_tests() {
    if [ "$SKIP_INTEGRATION_TESTS" = "true" ]; then
        warn "Skipping integration tests (SKIP_INTEGRATION_TESTS=true)"
        return 0
    fi

    log "Starting end-to-end integration tests..."

    # Start test infrastructure
    log "Starting test services..."
    docker-compose -f docker-compose.test.yml up -d || {
        error "Failed to start test infrastructure"
        return 1
    }

    # Wait for services to be ready
    log "Waiting for services to be ready..."
    sleep 30

    # Run integration tests
    local integration_failed=false

    if ! run_test_suite "Cross-SDK Integration Tests" "cd '$SCRIPT_DIR' && go test ./tests/e2e/... -v -timeout=300s"; then
        integration_failed=true
    fi

    # Cleanup
    log "Cleaning up test infrastructure..."
    docker-compose -f docker-compose.test.yml down -v

    if [ "$integration_failed" = "true" ]; then
        error "Integration tests failed"
        return 1
    else
        success "Integration tests passed"
        return 0
    fi
}

run_chaos_tests() {
    if [ "$SKIP_CHAOS_TESTS" = "true" ]; then
        warn "Skipping chaos tests (SKIP_CHAOS_TESTS=true)"
        return 0
    fi

    log "Starting chaos engineering tests..."
    warn "Chaos tests may take 10+ minutes and will stress test the system"

    export CHAOS_TESTING=true

    if run_test_suite "Chaos Engineering Tests" "cd '$SCRIPT_DIR/backend' && go test ./tests/chaos/... -v -timeout=900s"; then
        success "Chaos tests passed - system is resilient!"
        return 0
    else
        error "Chaos tests revealed stability issues"
        return 1
    fi
}

generate_test_report() {
    local end_time=$(date +%s)
    local total_duration=$((end_time - TEST_START_TIME))

    log "Generating comprehensive test report..."

    cat > "$SCRIPT_DIR/test-results/summary.md" << EOF
# Test Execution Summary

**Date:** $(date)
**Duration:** ${total_duration} seconds
**Configuration:**
- Skip SDK Tests: $SKIP_SDK_TESTS
- Skip Backend Tests: $SKIP_BACKEND_TESTS
- Skip Integration Tests: $SKIP_INTEGRATION_TESTS
- Skip Chaos Tests: $SKIP_CHAOS_TESTS
- Parallel Tests: $PARALLEL_TESTS

## Test Results

| Test Suite | Status | Coverage |
|------------|--------|----------|
| TypeScript SDK | $sdk_ts_status | [Coverage Report](../sdk/sdk-typescript/coverage/) |
| Python SDK | $sdk_py_status | [Coverage Report](../sdk/python/htmlcov/) |
| Backend Unit Tests | $backend_unit_status | [Coverage Report](../backend/coverage.html) |
| Backend Integration | $backend_integration_status | [Coverage Report](../backend/integration-coverage.html) |
| Security Tests | $security_status | [Report](../backend/gosec-report.json) |
| Performance Tests | $performance_status | [Benchmarks](../backend/benchmark-results.txt) |
| Chaos Tests | $chaos_status | [Logs](../backend/tests/chaos/chaos-logs.txt) |

## Recommendations

$test_recommendations

---
*Generated by test-all.sh*
EOF

    success "Test report generated: test-results/summary.md"
}

main() {
    log "🧪 Starting comprehensive Sangria Network testing"
    log "Configuration: SDK=$([[ $SKIP_SDK_TESTS == true ]] && echo "skip" || echo "run") Backend=$([[ $SKIP_BACKEND_TESTS == true ]] && echo "skip" || echo "run") Integration=$([[ $SKIP_INTEGRATION_TESTS == true ]] && echo "skip" || echo "run") Chaos=$([[ $SKIP_CHAOS_TESTS == true ]] && echo "skip" || echo "run")"

    setup_environment

    local failed_suites=()

    # Run test suites
    if [ "$PARALLEL_TESTS" = "true" ]; then
        log "Running tests in parallel mode..."

        run_sdk_tests &
        sdk_pid=$!

        run_backend_tests &
        backend_pid=$!

        # Wait for parallel tests
        if ! wait $sdk_pid; then
            failed_suites+=("SDK Tests")
        fi

        if ! wait $backend_pid; then
            failed_suites+=("Backend Tests")
        fi
    else
        log "Running tests sequentially..."

        if ! run_sdk_tests; then
            failed_suites+=("SDK Tests")
        fi

        if ! run_backend_tests; then
            failed_suites+=("Backend Tests")
        fi
    fi

    # Integration tests (always run sequentially)
    if ! run_integration_tests; then
        failed_suites+=("Integration Tests")
    fi

    # Chaos tests (optional, always sequential)
    if ! run_chaos_tests; then
        failed_suites+=("Chaos Tests")
    fi

    # Generate report
    generate_test_report

    # Final results
    local end_time=$(date +%s)
    local total_duration=$((end_time - TEST_START_TIME))

    echo
    log "🏁 Test execution completed in ${total_duration} seconds"

    if [ ${#failed_suites[@]} -eq 0 ]; then
        success "🎉 All test suites passed! System is ready for production."
        exit 0
    else
        error "💥 Test failures detected in: ${failed_suites[*]}"
        warn "Review test outputs and fix issues before deployment"
        exit 1
    fi
}

# Handle script arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-sdk)
            SKIP_SDK_TESTS=true
            shift
            ;;
        --skip-backend)
            SKIP_BACKEND_TESTS=true
            shift
            ;;
        --skip-integration)
            SKIP_INTEGRATION_TESTS=true
            shift
            ;;
        --enable-chaos)
            SKIP_CHAOS_TESTS=false
            shift
            ;;
        --parallel)
            PARALLEL_TESTS=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --skip-sdk           Skip SDK tests"
            echo "  --skip-backend       Skip backend tests"
            echo "  --skip-integration   Skip integration tests"
            echo "  --enable-chaos       Enable chaos engineering tests"
            echo "  --parallel           Run compatible tests in parallel"
            echo "  --help               Show this help"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main function
main