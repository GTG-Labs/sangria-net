#!/bin/bash
# Pre-Commit Testing Script
# Use this before committing code

set -e

echo "🔍 Pre-Commit Tests - Comprehensive Validation"
echo "=============================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Track what needs to be tested based on changes
detect_changes() {
    echo "🕵️ Detecting changes..."

    # Check git status to see what's changed
    if git rev-parse --git-dir > /dev/null 2>&1; then
        local backend_changes=$(git diff --name-only HEAD | grep -E "^backend/" | wc -l)
        local ts_changes=$(git diff --name-only HEAD | grep -E "^sdk/sdk-typescript/" | wc -l)
        local py_changes=$(git diff --name-only HEAD | grep -E "^sdk/python/" | wc -l)

        export TEST_BACKEND=$([[ $backend_changes -gt 0 ]] && echo "true" || echo "false")
        export TEST_TS_SDK=$([[ $ts_changes -gt 0 ]] && echo "true" || echo "false")
        export TEST_PY_SDK=$([[ $py_changes -gt 0 ]] && echo "true" || echo "false")
    else
        # Not a git repo, test everything
        export TEST_BACKEND=true
        export TEST_TS_SDK=true
        export TEST_PY_SDK=true
    fi

    echo -e "  Backend: $([[ $TEST_BACKEND == true ]] && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}skip${NC}")"
    echo -e "  TypeScript SDK: $([[ $TEST_TS_SDK == true ]] && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}skip${NC}")"
    echo -e "  Python SDK: $([[ $TEST_PY_SDK == true ]] && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}skip${NC}")"
}

# Setup comprehensive test environment
setup_full_test_env() {
    echo "🏗️ Setting up full test environment..."

    # Start all test services
    docker-compose -f docker-compose.test.yml down -v &> /dev/null || true
    docker-compose -f docker-compose.test.yml up -d

    echo "⏳ Waiting for all services to be ready..."
    sleep 30

    echo -e "${GREEN}✅ Full test environment ready${NC}"
}

# Run comprehensive tests
run_comprehensive_tests() {
    local start_time=$(date +%s)
    local failed_tests=()

    echo "🧪 Running comprehensive pre-commit tests..."

    # Backend tests
    if [[ $TEST_BACKEND == true ]]; then
        echo -e "${BLUE}🔧 Testing Backend...${NC}"
        if cd backend && ./test.sh; then
            echo -e "${GREEN}✅ Backend tests passed${NC}"
        else
            failed_tests+=("Backend")
        fi
        cd ..
    fi

    # TypeScript SDK tests
    if [[ $TEST_TS_SDK == true ]]; then
        echo -e "${BLUE}📦 Testing TypeScript SDK...${NC}"
        if cd sdk/sdk-typescript && ./test.sh; then
            echo -e "${GREEN}✅ TypeScript SDK tests passed${NC}"
        else
            failed_tests+=("TypeScript SDK")
        fi
        cd ../..
    fi

    # Python SDK tests
    if [[ $TEST_PY_SDK == true ]]; then
        echo -e "${BLUE}🐍 Testing Python SDK...${NC}"
        if cd sdk/python && ./test.sh; then
            echo -e "${GREEN}✅ Python SDK tests passed${NC}"
        else
            failed_tests+=("Python SDK")
        fi
        cd ../..
    fi

    # Integration tests (always run if any component changed)
    if [[ $TEST_BACKEND == true ]] || [[ $TEST_TS_SDK == true ]] || [[ $TEST_PY_SDK == true ]]; then
        echo -e "${BLUE}🔗 Testing Cross-Component Integration...${NC}"
        if go test ./tests/e2e/... -v -timeout=300s; then
            echo -e "${GREEN}✅ Integration tests passed${NC}"
        else
            failed_tests+=("Integration")
        fi
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ ${#failed_tests[@]} -eq 0 ]; then
        echo -e "${GREEN}🎉 All tests passed in ${duration}s! Ready to commit.${NC}"
        return 0
    else
        echo -e "${RED}❌ Tests failed: ${failed_tests[*]}${NC}"
        echo -e "${YELLOW}⚠️ Please fix issues before committing${NC}"
        return 1
    fi
}

# Generate test summary
generate_summary() {
    echo ""
    echo "📊 Test Summary"
    echo "==============="
    echo "Backend Coverage: $(cd backend && go tool cover -func=coverage.out | tail -1 | awk '{print $3}' || echo 'N/A')"
    echo "TypeScript Coverage: Available in sdk/sdk-typescript/coverage/"
    echo "Python Coverage: Available in sdk/python/htmlcov/"
    echo ""
    echo "🔒 Security: $(ls backend/gosec-report.json 2>/dev/null && echo 'Scanned' || echo 'N/A')"
    echo "⚡ Performance: $(ls backend/benchmark-results.txt 2>/dev/null && echo 'Benchmarked' || echo 'N/A')"
}

# Cleanup
cleanup() {
    echo "🧹 Cleaning up..."
    docker-compose -f docker-compose.test.yml down &> /dev/null || true
}

# Main execution
main() {
    trap cleanup EXIT

    detect_changes
    setup_full_test_env
    run_comprehensive_tests
    local test_result=$?

    generate_summary

    if [ $test_result -eq 0 ]; then
        echo -e "${GREEN}✅ Pre-commit validation successful!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Pre-commit validation failed!${NC}"
        exit 1
    fi
}

main "$@"