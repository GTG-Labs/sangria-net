#!/bin/bash

# TypeScript SDK Test Script

set -e

echo "🧪 Running TypeScript SDK Tests..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Build the project
echo "🔨 Building project..."
pnpm run build

# Run type checking
echo "📝 Type checking..."
if ! pnpm exec tsc --noEmit; then
    echo "❌ Type checking failed"
    exit 1
fi

# Run unit tests
echo "🧪 Running unit tests..."
pnpm run test -- tests/unit/

# Run integration tests
echo "🔌 Running integration tests..."
pnpm run test -- tests/integration/

# Run all tests with coverage
echo "📊 Running all tests with coverage..."
pnpm run test:coverage

echo "✅ All TypeScript SDK tests passed!"