#!/bin/bash

# Python SDK Test Script

set -e

echo "🧪 Running Python SDK Tests..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "🐍 Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
echo "⚡ Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📦 Installing dependencies..."
pip install -e ".[test,fastapi]"

# Run unit tests
echo "🧪 Running unit tests..."
pytest tests/unit/ -v

# Run integration tests
echo "🔌 Running integration tests..."
pytest tests/integration/ -v

# Run all tests with coverage
echo "📊 Running all tests with coverage..."
pytest --cov=src/sangria_sdk --cov-report=term-missing --cov-report=html

echo "✅ All Python SDK tests passed!"