#!/bin/bash

# Backend Go Test Script

set -e

echo "🧪 Running Backend Go Tests..."

# Check if go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
go mod download
go mod tidy

# Run different test suites
echo "🧪 Running unit tests..."
go test ./tests/unit/... -v -race -cover

echo "🔌 Running integration tests..."
go test ./tests/integration/... -v -timeout=60s

echo "🔒 Running security tests..."
go test ./tests/security/... -v -timeout=30s

echo "⚡ Running performance tests..."
go test ./tests/performance/... -v -timeout=120s -short=false

echo "🌪️  Running chaos tests (if enabled)..."
if [ "$CHAOS_TESTING" = "true" ]; then
    go test ./tests/chaos/... -v -timeout=300s
else
    echo "Skipping chaos tests (set CHAOS_TESTING=true to enable)"
fi

echo "📊 Running benchmarks..."
go test ./tests/performance/... -bench=. -benchmem

echo "📝 Generating test coverage report..."
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html

echo "✅ All backend tests completed!"
echo "📊 Coverage report: coverage.html"