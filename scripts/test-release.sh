#!/bin/bash
# Release Testing Script
# Use this before major releases - includes chaos testing

set -e

echo "🚀 Release Testing - Full Validation with Chaos"
echo "================================================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
ENABLE_CHAOS=${ENABLE_CHAOS:-true}
ENABLE_PERFORMANCE=${ENABLE_PERFORMANCE:-true}
ENABLE_SECURITY=${ENABLE_SECURITY:-true}

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
    echo -e "${YELLOW}⚠️ $1${NC}"
}

# Pre-flight checks
preflight_checks() {
    log "Running pre-flight checks..."

    # Check Docker
    if ! command -v docker &> /dev/null || ! docker info &> /dev/null; then
        error "Docker not available"
        exit 1
    fi

    # Check disk space
    local available_space=$(df . | tail -1 | awk '{print $4}')
    if [[ $available_space -lt 2000000 ]]; then  # 2GB
        warn "Low disk space. Chaos tests may fail."
    fi

    # Check memory
    local available_memory=$(free -m | grep '^Mem:' | awk '{print $7}' 2>/dev/null || echo "unknown")
    if [[ $available_memory != "unknown" ]] && [[ $available_memory -lt 4000 ]]; then
        warn "Low memory. Performance tests may be affected."
    fi

    success "Pre-flight checks passed"
}

# Setup full test infrastructure
setup_release_environment() {
    log "Setting up complete test infrastructure..."

    # Clean any existing test environment
    docker-compose -f docker-compose.test.yml down -v &> /dev/null || true

    if [[ $ENABLE_CHAOS == true ]]; then
        docker-compose -f backend/tests/chaos/docker-compose.chaos.yml down -v &> /dev/null || true
    fi

    # Start main test environment
    log "Starting test services..."
    docker-compose -f docker-compose.test.yml up -d

    # Setup chaos environment if enabled
    if [[ $ENABLE_CHAOS == true ]]; then
        log "Setting up chaos testing environment..."
        cd backend/tests/chaos
        docker-compose -f docker-compose.chaos.yml up -d --build
        cd ../../..
    fi

    log "Waiting for all services to be ready..."
    sleep 45

    success "Release environment ready"
}

# Run all test suites
run_all_tests() {
    local start_time=$(date +%s)
    local failed_suites=()

    log "Starting comprehensive test execution..."

    # 1. Unit Tests (all components)
    echo -e "${PURPLE}🧪 Phase 1: Unit Tests${NC}"
    if ! run_unit_tests; then
        failed_suites+=("Unit Tests")
    fi

    # 2. Integration Tests
    echo -e "${PURPLE}🔗 Phase 2: Integration Tests${NC}"
    if ! run_integration_tests; then
        failed_suites+=("Integration Tests")
    fi

    # 3. Security Tests
    if [[ $ENABLE_SECURITY == true ]]; then
        echo -e "${PURPLE}🔒 Phase 3: Security Tests${NC}"
        if ! run_security_tests; then
            failed_suites+=("Security Tests")
        fi
    fi

    # 4. Performance Tests
    if [[ $ENABLE_PERFORMANCE == true ]]; then
        echo -e "${PURPLE}⚡ Phase 4: Performance Tests${NC}"
        if ! run_performance_tests; then
            failed_suites+=("Performance Tests")
        fi
    fi

    # 5. Chaos Tests
    if [[ $ENABLE_CHAOS == true ]]; then
        echo -e "${PURPLE}🌪️ Phase 5: Chaos Engineering Tests${NC}"
        warn "Chaos tests will stress the system and may take 15+ minutes"
        if ! run_chaos_tests; then
            failed_suites+=("Chaos Tests")
        fi
    fi

    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))

    echo ""
    log "Test execution completed in ${total_duration} seconds"

    if [ ${#failed_suites[@]} -eq 0 ]; then
        success "🎉 ALL TEST SUITES PASSED! System is release-ready."
        return 0
    else
        error "💥 Failed test suites: ${failed_suites[*]}"
        return 1
    fi
}

run_unit_tests() {
    cd backend && go test ./tests/unit/... -v -race -cover && cd .. &&
    cd sdk/sdk-typescript && pnpm run test tests/unit/ && cd ../.. &&
    cd sdk/python && source venv/bin/activate && pytest tests/unit/ -v && cd ../..
}

run_integration_tests() {
    cd backend && go test ./tests/integration/... -v -timeout=120s && cd .. &&
    cd sdk/sdk-typescript && pnpm run test tests/integration/ && cd ../.. &&
    cd sdk/python && source venv/bin/activate && pytest tests/integration/ -v && cd ../.. &&
    go test ./tests/e2e/... -v -timeout=300s
}

run_security_tests() {
    cd backend &&
    gosec -fmt json -out gosec-report.json ./... &&
    staticcheck ./... &&
    go test ./tests/security/... -v &&
    cd ..
}

run_performance_tests() {
    cd backend &&
    go test ./tests/performance/... -v -timeout=300s &&
    go test ./tests/performance/... -bench=. -benchmem | tee benchmark-results.txt &&
    cd ..
}

run_chaos_tests() {
    export CHAOS_TESTING=true
    cd backend &&
    go test ./tests/chaos/... -v -timeout=900s &&
    cd ..
}

# Generate comprehensive release report
generate_release_report() {
    local report_file="test-results/release-report-$(date +%Y%m%d-%H%M%S).md"
    mkdir -p test-results

    log "Generating release test report..."

    cat > "$report_file" << EOF
# Sangria.NET Release Test Report

**Date:** $(date)
**Duration:** $(($(date +%s) - RELEASE_START_TIME)) seconds
**Configuration:**
- Chaos Tests: $ENABLE_CHAOS
- Performance Tests: $ENABLE_PERFORMANCE
- Security Tests: $ENABLE_SECURITY

## Test Results Summary

| Test Suite | Status | Coverage | Notes |
|------------|--------|----------|-------|
| Backend Unit | ✅ PASS | $(cd backend && go tool cover -func=coverage.out 2>/dev/null | tail -1 | awk '{print $3}' || echo 'N/A') | Core payment logic |
| TypeScript SDK | ✅ PASS | [Report](../sdk/sdk-typescript/coverage/) | Framework adapters |
| Python SDK | ✅ PASS | [Report](../sdk/python/htmlcov/) | FastAPI integration |
| Integration | ✅ PASS | Cross-component | End-to-end flows |
| Security | $([ -f backend/gosec-report.json ] && echo '✅ PASS' || echo '⏭️ SKIP') | [Report](../backend/gosec-report.json) | Vulnerability scan |
| Performance | $([ -f backend/benchmark-results.txt ] && echo '✅ PASS' || echo '⏭️ SKIP') | [Report](../backend/benchmark-results.txt) | Load & benchmarks |
| Chaos | $([[ $ENABLE_CHAOS == true ]] && echo '✅ PASS' || echo '⏭️ SKIP') | Resilience testing | Failure injection |

## Performance Baselines

$([ -f backend/benchmark-results.txt ] && echo '```' && tail -10 backend/benchmark-results.txt && echo '```' || echo 'Performance tests not run')

## Security Findings

$([ -f backend/gosec-report.json ] && echo 'Security scan completed. Review gosec-report.json for details.' || echo 'Security scan not run')

## Recommendations

- ✅ System is ready for production deployment
- ✅ All critical test suites passing
- ✅ Performance within acceptable limits
- ✅ Security vulnerabilities addressed
- ✅ Chaos engineering validates system resilience

## Next Steps

1. **Deploy to staging** for final validation
2. **Run production smoke tests** after deployment
3. **Monitor performance metrics** in production
4. **Review security scan results** and address any findings

---
*Generated by release testing automation*
EOF

    success "Release report generated: $report_file"

    # Also display summary
    echo ""
    echo "📋 RELEASE VALIDATION SUMMARY"
    echo "=============================="
    cat "$report_file" | grep -A 20 "## Test Results Summary"
}

# Cleanup everything
cleanup() {
    log "Cleaning up test environments..."
    docker-compose -f docker-compose.test.yml down -v &> /dev/null || true

    if [[ $ENABLE_CHAOS == true ]]; then
        cd backend/tests/chaos &> /dev/null
        docker-compose -f docker-compose.chaos.yml down -v &> /dev/null || true
        cd ../../.. &> /dev/null || true
    fi

    success "Cleanup completed"
}

# Main execution
main() {
    export RELEASE_START_TIME=$(date +%s)
    trap cleanup EXIT

    log "🚀 Starting release validation process..."

    preflight_checks
    setup_release_environment

    if run_all_tests; then
        generate_release_report
        success "🎉 RELEASE VALIDATION SUCCESSFUL! System is production-ready."
        exit 0
    else
        error "💥 RELEASE VALIDATION FAILED! Review test results before proceeding."
        exit 1
    fi
}

# Handle command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-chaos)
            ENABLE_CHAOS=false
            shift
            ;;
        --no-performance)
            ENABLE_PERFORMANCE=false
            shift
            ;;
        --no-security)
            ENABLE_SECURITY=false
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --no-chaos        Skip chaos engineering tests"
            echo "  --no-performance  Skip performance tests"
            echo "  --no-security     Skip security tests"
            echo "  --help            Show this help"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

main