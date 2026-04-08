#!/bin/bash
# Testing Setup Script
# One-time setup for the testing environment

set -e

echo "🛠️ Sangria.NET Testing Environment Setup"
echo "========================================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Check and install prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    local missing=()

    # Check Docker
    if ! command -v docker &> /dev/null; then
        missing+=("Docker")
        echo "  → Docker: Not installed"
    else
        echo "  → Docker: $(docker --version)"
    fi

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        missing+=("Docker Compose")
        echo "  → Docker Compose: Not installed"
    else
        echo "  → Docker Compose: $(docker-compose --version)"
    fi

    # Check Go
    if ! command -v go &> /dev/null; then
        missing+=("Go")
        echo "  → Go: Not installed"
    else
        echo "  → Go: $(go version)"
    fi

    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing+=("Node.js")
        echo "  → Node.js: Not installed"
    else
        echo "  → Node.js: $(node --version)"
    fi

    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        missing+=("pnpm")
        echo "  → pnpm: Not installed"
    else
        echo "  → pnpm: $(pnpm --version)"
    fi

    # Check Python
    if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
        missing+=("Python")
        echo "  → Python: Not installed"
    else
        local python_cmd=$(command -v python3 || command -v python)
        echo "  → Python: $($python_cmd --version)"
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        error "Missing prerequisites: ${missing[*]}"
        echo ""
        echo "📋 Installation Instructions:"
        echo "=========================="

        for tool in "${missing[@]}"; do
            case $tool in
                "Docker")
                    echo "🐳 Docker: https://www.docker.com/products/docker-desktop/"
                    ;;
                "Docker Compose")
                    echo "🔗 Docker Compose: Included with Docker Desktop"
                    ;;
                "Go")
                    echo "🐹 Go: https://golang.org/dl/"
                    ;;
                "Node.js")
                    echo "📦 Node.js: https://nodejs.org/ (use LTS version)"
                    ;;
                "pnpm")
                    echo "📦 pnpm: npm install -g pnpm"
                    ;;
                "Python")
                    echo "🐍 Python: https://python.org/downloads/ (3.10+)"
                    ;;
            esac
        done
        echo ""
        echo "Please install missing tools and run this script again."
        exit 1
    fi

    success "All prerequisites installed"
}

# Setup project dependencies
setup_dependencies() {
    log "Setting up project dependencies..."

    # Backend dependencies
    echo "📦 Installing Go dependencies..."
    cd backend
    go mod download
    go mod tidy

    # Install Go tools
    echo "🔧 Installing Go tools..."
    go install honnef.co/go/tools/cmd/staticcheck@latest
    # Try multiple gosec sources (repository moved)
    go install github.com/securecodewarrior/gosec/v2/cmd/gosec@latest 2>/dev/null || \
    go install github.com/securecodewarrior/gosec/cmd/gosec@latest 2>/dev/null || \
    echo "   ⚠️ gosec installation failed, using staticcheck only"
    cd ..

    # TypeScript SDK dependencies
    echo "📦 Installing TypeScript SDK dependencies..."
    cd sdk/sdk-typescript
    if [ ! -d "node_modules" ]; then
        pnpm install
    else
        echo "  → Dependencies already installed"
    fi
    cd ../..

    # Python SDK dependencies
    echo "📦 Installing Python SDK dependencies..."
    cd sdk/python

    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi

    # Activate and install dependencies
    source venv/bin/activate
    pip install --upgrade pip
    pip install -e ".[test,fastapi]"

    cd ../..

    success "Dependencies installed"
}

# Create test directories
setup_test_directories() {
    log "Creating test directories..."

    mkdir -p test-results
    mkdir -p coverage-reports
    mkdir -p scripts/logs

    success "Test directories created"
}

# Make scripts executable
setup_scripts() {
    log "Setting up test scripts..."

    chmod +x scripts/*.sh
    chmod +x test-all.sh
    chmod +x backend/test.sh
    chmod +x sdk/sdk-typescript/test.sh
    chmod +x sdk/python/test.sh

    success "Scripts configured"
}

# Test Docker setup
test_docker_setup() {
    log "Testing Docker setup..."

    # Test basic Docker functionality
    if ! docker info &> /dev/null; then
        error "Docker daemon not running. Please start Docker Desktop."
        exit 1
    fi

    # Test Docker Compose with a simple service
    echo "🐳 Testing Docker Compose..."
    docker-compose -f docker-compose.test.yml config &> /dev/null

    # Test pulling required images
    echo "📥 Pulling required Docker images..."
    docker pull postgres:15-alpine &> /dev/null
    docker pull redis:7-alpine &> /dev/null

    success "Docker setup verified"
}

# Run a quick smoke test
run_smoke_test() {
    log "Running setup verification smoke test..."

    # Test backend compilation
    echo "🔧 Testing backend compilation..."
    cd backend
    if go build -o /tmp/sangria-test .; then
        rm -f /tmp/sangria-test
        echo "  → Backend compiles successfully"
    else
        error "Backend compilation failed"
        cd ..
        exit 1
    fi
    cd ..

    # Test TypeScript SDK build
    echo "🔧 Testing TypeScript SDK build..."
    cd sdk/sdk-typescript
    if pnpm run build; then
        echo "  → TypeScript SDK builds successfully"
    else
        error "TypeScript SDK build failed"
        cd ../..
        exit 1
    fi
    cd ../..

    # Test Python SDK import
    echo "🔧 Testing Python SDK import..."
    cd sdk/python
    source venv/bin/activate
    if python -c "import sangria_sdk; print('Python SDK imports successfully')"; then
        echo "  → Python SDK imports successfully"
    else
        error "Python SDK import failed"
        cd ../..
        exit 1
    fi
    cd ../..

    success "Smoke test passed"
}

# Create helpful aliases
create_aliases() {
    local alias_file="$HOME/.sangria_aliases"

    log "Creating helpful aliases..."

    cat > "$alias_file" << 'EOF'
# Sangria.NET Testing Aliases
# Add this to your shell profile (.bashrc, .zshrc, etc.)

# Quick development testing
alias st-dev='./scripts/test-dev.sh'

# Pre-commit testing
alias st-commit='./scripts/test-pre-commit.sh'

# Full release testing
alias st-release='./scripts/test-release.sh'

# Individual component testing
alias st-backend='cd backend && ./test.sh && cd ..'
alias st-ts='cd sdk/sdk-typescript && ./test.sh && cd ../..'
alias st-py='cd sdk/python && ./test.sh && cd ../..'

# Quick Docker commands
alias st-up='docker-compose -f docker-compose.test.yml up -d'
alias st-down='docker-compose -f docker-compose.test.yml down -v'
alias st-logs='docker-compose -f docker-compose.test.yml logs -f'

# Coverage reports
alias st-coverage='open backend/coverage.html && open sdk/sdk-typescript/coverage/index.html && open sdk/python/htmlcov/index.html'
EOF

    echo "📝 Aliases created in $alias_file"
    echo "   Add 'source $alias_file' to your shell profile to use these shortcuts"
}

# Display usage instructions
show_usage_instructions() {
    echo ""
    echo "🎉 Setup Complete! Here's how to use your testing environment:"
    echo ""
    echo "📋 QUICK COMMANDS"
    echo "================="
    echo ""
    echo "🚀 Development Testing (fast feedback):"
    echo "   ./scripts/test-dev.sh"
    echo ""
    echo "✅ Pre-Commit Testing (comprehensive):"
    echo "   ./scripts/test-pre-commit.sh"
    echo ""
    echo "🎯 Release Testing (includes chaos):"
    echo "   ./scripts/test-release.sh"
    echo ""
    echo "🔧 Individual Component Testing:"
    echo "   cd backend && ./test.sh"
    echo "   cd sdk/sdk-typescript && ./test.sh"
    echo "   cd sdk/python && ./test.sh"
    echo ""
    echo "📊 View Coverage Reports:"
    echo "   open backend/coverage.html"
    echo "   open sdk/sdk-typescript/coverage/index.html"
    echo "   open sdk/python/htmlcov/index.html"
    echo ""
    echo "🐳 Docker Commands:"
    echo "   docker-compose -f docker-compose.test.yml up -d    # Start services"
    echo "   docker-compose -f docker-compose.test.yml down -v  # Stop services"
    echo ""
    echo "📚 Documentation:"
    echo "   Read TESTING.md for detailed information"
    echo ""
    echo "🔧 RECOMMENDED WORKFLOW"
    echo "======================"
    echo "1. During development: ./scripts/test-dev.sh"
    echo "2. Before committing:  ./scripts/test-pre-commit.sh"
    echo "3. Before releases:    ./scripts/test-release.sh"
    echo ""
}

# Main execution
main() {
    echo ""
    log "Starting Sangria.NET testing environment setup..."
    echo ""

    check_prerequisites
    setup_dependencies
    setup_test_directories
    setup_scripts
    test_docker_setup
    run_smoke_test
    create_aliases

    echo ""
    success "🎉 Testing environment setup completed successfully!"

    show_usage_instructions
}

main "$@"