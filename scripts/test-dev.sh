#!/bin/bash
# Quick Development Testing Script
# Use this for rapid feedback during development

set -e

echo "🚀 Quick Development Tests - Fast Feedback Mode"
echo "================================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check prerequisites
check_prerequisites() {
    echo "🔍 Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found. Please install Docker Desktop${NC}"
        echo "https://www.docker.com/products/docker-desktop/"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo -e "${RED}❌ Docker not running. Please start Docker Desktop${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ Prerequisites OK${NC}"
}

# Start minimal test infrastructure
setup_test_env() {
    echo "🏗️ Setting up minimal test environment..."

    # Start only essential services for fast testing
    docker-compose -f docker-compose.test.yml up -d postgres-test redis &> /dev/null

    echo "⏳ Waiting for services to be ready..."

    # Wait for PostgreSQL to be ready
    local timeout=60
    local elapsed=0
    echo -n "  → Waiting for PostgreSQL... "

    while ! docker exec postgres-test pg_isready -U testuser -d testdb &> /dev/null; do
        if [ $elapsed -ge $timeout ]; then
            echo -e "${RED}❌ PostgreSQL failed to start within ${timeout}s${NC}"
            exit 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
        echo -n "."
    done
    echo -e " ${GREEN}✅${NC}"

    # Wait for Redis to be ready
    elapsed=0
    echo -n "  → Waiting for Redis... "

    while ! docker exec redis redis-cli ping &> /dev/null; do
        if [ $elapsed -ge $timeout ]; then
            echo -e "${RED}❌ Redis failed to start within ${timeout}s${NC}"
            exit 1
        fi
        sleep 2
        elapsed=$((elapsed + 2))
        echo -n "."
    done
    echo -e " ${GREEN}✅${NC}"

    echo -e "${GREEN}✅ Test environment ready${NC}"
}

# Run fast tests
run_fast_tests() {
    local start_time=$(date +%s)

    echo "🧪 Running fast development tests..."

    # Run tests in parallel for speed and capture PIDs
    echo "  → Backend unit tests..."
    (cd backend && go test ../tests/backend/unit/... -short -race) &
    local backend_pid=$!

    echo "  → TypeScript SDK tests..."
    (cd sdk/sdk-typescript && pnpm run test:fast) &
    local typescript_pid=$!

    echo "  → Python SDK unit tests..."
    (cd sdk/python && source venv/bin/activate && pytest ../../tests/sdk/python/unit/ -x) &
    local python_pid=$!

    # Wait for all tests and check their exit statuses
    local failed=0

    wait $backend_pid
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Backend unit tests failed${NC}"
        failed=1
    fi

    wait $typescript_pid
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ TypeScript SDK tests failed${NC}"
        failed=1
    fi

    wait $python_pid
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Python SDK unit tests failed${NC}"
        failed=1
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $failed -eq 1 ]; then
        echo -e "${RED}❌ Some tests failed after ${duration}s${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ Fast tests completed in ${duration}s${NC}"
    fi
}

# Cleanup
cleanup() {
    echo "🧹 Cleaning up..."
    docker-compose -f docker-compose.test.yml down &> /dev/null
}

# Main execution
main() {
    trap cleanup EXIT

    check_prerequisites
    setup_test_env
    run_fast_tests

    echo -e "${GREEN}🎉 Development tests passed! Ready to commit.${NC}"
}

main "$@"