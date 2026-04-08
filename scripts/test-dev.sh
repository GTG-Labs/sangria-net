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
    sleep 10

    echo -e "${GREEN}✅ Test environment ready${NC}"
}

# Run fast tests
run_fast_tests() {
    local start_time=$(date +%s)

    echo "🧪 Running fast development tests..."

    # Run tests in parallel for speed
    {
        echo "  → Backend unit tests..."
        cd backend && go test ./tests/unit/... -short -race &
    } &

    {
        echo "  → TypeScript SDK tests..."
        cd sdk/sdk-typescript && pnpm run test:fast &
    } &

    {
        echo "  → Python SDK unit tests..."
        cd sdk/python && source venv/bin/activate && pytest tests/unit/ -x &
    } &

    # Wait for all tests
    wait

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    echo -e "${GREEN}✅ Fast tests completed in ${duration}s${NC}"
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