#!/bin/bash

# Sangria SDK Release Script
# Usage: ./scripts/release.sh [patch|minor|major] [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "\n${BLUE}===${NC} $1 ${BLUE}===${NC}"
}

# Check if we're in the right directory
if [ ! -f "sdk/sdk-typescript/package.json" ] || [ ! -f "sdk/sdk-typescript-py/pyproject.toml" ]; then
    print_error "This script must be run from the sangria-net root directory"
    exit 1
fi

# Parse arguments
RELEASE_TYPE=${1:-patch}
CUSTOM_VERSION=$2

# Validate release type
if [[ ! "$RELEASE_TYPE" =~ ^(patch|minor|major)$ ]] && [ -z "$CUSTOM_VERSION" ]; then
    print_error "Release type must be patch, minor, or major"
    echo "Usage: $0 [patch|minor|major] [version]"
    exit 1
fi

print_step "Sangria SDK Release Process"

# Get current version
CURRENT_VERSION=$(node -p "require('./sdk/sdk-typescript/package.json').version")
print_status "Current version: $CURRENT_VERSION"

# Calculate new version
if [ -n "$CUSTOM_VERSION" ]; then
    NEW_VERSION="$CUSTOM_VERSION"
    print_status "Using custom version: $NEW_VERSION"
else
    case "$RELEASE_TYPE" in
        major) NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{$1 = $1 + 1; $2 = 0; $3 = 0;} 1' OFS=.) ;;
        minor) NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{$2 = $2 + 1; $3 = 0;} 1' OFS=.) ;;
        patch) NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{$3 = $3 + 1;} 1' OFS=.) ;;
    esac
    print_status "New version ($RELEASE_TYPE): $NEW_VERSION"
fi

# Confirm with user
read -p "$(echo -e ${YELLOW}Are you sure you want to release version $NEW_VERSION? [y/N]:${NC} )" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "Release cancelled"
    exit 1
fi

print_step "Running Pre-Release Checks"

# Check git status
if [ -n "$(git status --porcelain)" ]; then
    print_error "Working directory is not clean. Please commit or stash your changes."
    git status --short
    exit 1
fi

# Check if we're on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    print_warning "You're not on the main branch (current: $CURRENT_BRANCH)"
    read -p "$(echo -e ${YELLOW}Continue anyway? [y/N]:${NC} )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Release cancelled"
        exit 1
    fi
fi

print_step "Running Tests"

# Run tests
print_status "Running comprehensive test suite..."
cd tests
pnpm install > /dev/null 2>&1
if ! pnpm test:all; then
    print_error "Tests failed! Please fix before releasing."
    exit 1
fi
cd ..

print_step "Updating Package Versions"

# Update TypeScript package.json
print_status "Updating TypeScript SDK version..."
cd sdk/sdk-typescript
npm version "$NEW_VERSION" --no-git-tag-version
cd ../..

# Update Python pyproject.toml
print_status "Updating Python SDK version..."
cd sdk/sdk-typescript-py
sed -i '' "s/version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" pyproject.toml
cd ../..

print_step "Building Packages"

# Build TypeScript SDK
print_status "Building TypeScript SDK..."
cd sdk/sdk-typescript
pnpm install > /dev/null 2>&1
pnpm build
cd ../..

# Build Python SDK
print_status "Building Python SDK..."
cd sdk/sdk-typescript-py
python -m build > /dev/null 2>&1
cd ../..

print_step "Final Confirmation"

print_status "Ready to release:"
echo "  - TypeScript: @sangria/core@$NEW_VERSION"
echo "  - Python: sangria-merchant-sdk@$NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Push changes to trigger CI/CD"
echo "  2. Create GitHub release"
echo "  3. Publish to npm and PyPI"
echo ""

read -p "$(echo -e ${YELLOW}Commit and tag this release? [y/N]:${NC} )" -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_step "Committing Release"

    git add sdk/sdk-typescript/package.json sdk/sdk-typescript-py/pyproject.toml
    git commit -m "chore: release v$NEW_VERSION

- TypeScript SDK: @sangria/core@$NEW_VERSION
- Python SDK: sangria-merchant-sdk@$NEW_VERSION"

    git tag "v$NEW_VERSION"

    print_status "Created commit and tag v$NEW_VERSION"
    print_warning "Run 'git push && git push --tags' to trigger CI/CD deployment"
else
    print_warning "Release prepared but not committed. You can manually commit the version changes."
fi

print_step "Release Complete"
print_status "Version $NEW_VERSION is ready for deployment!"