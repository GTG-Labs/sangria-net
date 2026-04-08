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

# Write test status to file
write_test_status() {
    local component="$1"
    local status="$2"
    echo "$status" > "$SCRIPT_DIR/test-results/${component}.status"
}

# Read test status from file with default
read_test_status() {
    local component="$1"
    local default="${2:-NOT RUN}"
    if [ -f "$SCRIPT_DIR/test-results/${component}.status" ]; then
        cat "$SCRIPT_DIR/test-results/${component}.status"
    else
        echo "$default"
    fi
}

# Wait for services to be healthy
wait_for_services() {
    local timeout=${1:-120}  # Default 2 minutes timeout
    local interval=5
    local elapsed=0

    log "Waiting for services to be healthy (timeout: ${timeout}s)..."

    while [ $elapsed -lt $timeout ]; do
        # Check if all containers are healthy
        local unhealthy_count=$(docker-compose -f "$SCRIPT_DIR/docker-compose.test.yml" ps --format json 2>/dev/null | \
                              jq -r '.[] | select(.Health != "healthy" and .Health != "")' 2>/dev/null | wc -l || echo "0")

        if [ "$unhealthy_count" -eq 0 ]; then
            # Double-check by hitting the backend health endpoint directly
            if curl -s -f http://localhost:8080/health >/dev/null 2>&1; then
                success "All services are healthy!"
                return 0
            fi
        fi

        log "Services still starting... (${elapsed}s elapsed)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done

    error "Services failed to become healthy within ${timeout}s"
    # Show status for debugging
    docker-compose -f "$SCRIPT_DIR/docker-compose.test.yml" ps
    return 1
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
        write_test_status "sdk_ts" "SKIPPED"
        write_test_status "sdk_py" "SKIPPED"
        return 0
    fi

    local failed_tests=()

    # TypeScript SDK tests
    if run_test_suite "TypeScript SDK Tests" "cd '$SCRIPT_DIR/sdk/sdk-typescript' && ./test.sh"; then
        success "TypeScript SDK tests passed"
        write_test_status "sdk_ts" "PASSED"
    else
        failed_tests+=("TypeScript SDK")
        write_test_status "sdk_ts" "FAILED"
    fi

    # Python SDK tests
    if run_test_suite "Python SDK Tests" "cd '$SCRIPT_DIR/sdk/python' && ./test.sh"; then
        success "Python SDK tests passed"
        write_test_status "sdk_py" "PASSED"
    else
        failed_tests+=("Python SDK")
        write_test_status "sdk_py" "FAILED"
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
        write_test_status "backend_unit" "SKIPPED"
        write_test_status "backend_integration" "SKIPPED"
        write_test_status "security" "SKIPPED"
        write_test_status "performance" "SKIPPED"
        return 0
    fi

    if run_test_suite "Backend Go Tests" "cd '$SCRIPT_DIR/backend' && ./test.sh"; then
        success "Backend tests passed"
        write_test_status "backend_unit" "PASSED"
        write_test_status "backend_integration" "PASSED"
        write_test_status "security" "PASSED"
        write_test_status "performance" "PASSED"
        return 0
    else
        error "Backend tests failed"
        write_test_status "backend_unit" "FAILED"
        write_test_status "backend_integration" "FAILED"
        write_test_status "security" "FAILED"
        write_test_status "performance" "FAILED"
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
    docker-compose -f "$SCRIPT_DIR/docker-compose.test.yml" up -d || {
        error "Failed to start test infrastructure"
        return 1
    }

    # Wait for services to be ready
    if ! wait_for_services 120; then
        error "Failed to start test infrastructure"
        return 1
    fi

    # Run integration tests
    local integration_failed=false

    if ! run_test_suite "Cross-SDK Integration Tests" "cd '$SCRIPT_DIR' && go test ./tests/e2e/... -v -timeout=300s"; then
        integration_failed=true
    fi

    # Cleanup
    log "Cleaning up test infrastructure..."
    docker-compose -f "$SCRIPT_DIR/docker-compose.test.yml" down -v

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
        write_test_status "chaos" "SKIPPED"
        return 0
    fi

    log "Starting chaos engineering tests..."
    warn "Chaos tests may take 10+ minutes and will stress test the system"

    export CHAOS_TESTING=true

    if run_test_suite "Chaos Engineering Tests" "cd '$SCRIPT_DIR' && go test ./tests/backend/chaos/... -v -timeout=900s"; then
        success "Chaos tests passed - system is resilient!"
        write_test_status "chaos" "PASSED"
        return 0
    else
        error "Chaos tests revealed stability issues"
        write_test_status "chaos" "FAILED"
        return 1
    fi
}

generate_test_report() {
    local end_time=$(date +%s)
    local total_duration=$((end_time - TEST_START_TIME))

    log "Generating comprehensive test report..."

    # Read status from files
    local sdk_ts_status=$(read_test_status "sdk_ts")
    local sdk_py_status=$(read_test_status "sdk_py")
    local backend_unit_status=$(read_test_status "backend_unit")
    local backend_integration_status=$(read_test_status "backend_integration")
    local security_status=$(read_test_status "security")
    local performance_status=$(read_test_status "performance")
    local chaos_status=$(read_test_status "chaos")

    # Generate recommendations based on test results
    local test_recommendations=""
    if [[ "$sdk_ts_status" == "FAILED" ]] || [[ "$sdk_py_status" == "FAILED" ]]; then
        test_recommendations+="- Fix SDK test failures before release\n"
    fi
    if [[ "$backend_unit_status" == "FAILED" ]] || [[ "$backend_integration_status" == "FAILED" ]]; then
        test_recommendations+="- Address backend test issues\n"
    fi
    if [[ "$security_status" == "FAILED" ]]; then
        test_recommendations+="- Critical: Fix security issues before deployment\n"
    fi
    if [[ "$chaos_status" == "FAILED" ]]; then
        test_recommendations+="- Improve system resilience based on chaos test findings\n"
    fi
    if [[ -z "$test_recommendations" ]]; then
        test_recommendations="All tests passed! System is ready for deployment."
    fi

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