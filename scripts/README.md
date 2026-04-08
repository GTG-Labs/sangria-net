# Automated Testing Scripts

These scripts provide automated workflows for testing Sangria.NET without manual intervention.

## 🚀 Quick Start

```bash
# One-time setup (run once)
./scripts/test-setup.sh

# Daily development workflow
./scripts/test-dev.sh        # Fast feedback during development
./scripts/test-pre-commit.sh # Before committing code
./scripts/test-release.sh    # Before releases (includes chaos tests)
```

## 📋 Script Overview

### `test-setup.sh` - One-Time Environment Setup
**Purpose:** Initial setup of the testing environment
**Duration:** 5-10 minutes
**When to use:** First time setup, or after major dependency changes

**What it does:**
- ✅ Checks prerequisites (Docker, Go, Node.js, Python)
- ✅ Installs project dependencies
- ✅ Sets up test directories and scripts
- ✅ Verifies Docker configuration
- ✅ Runs smoke tests to validate setup
- ✅ Creates helpful aliases

```bash
./scripts/test-setup.sh
```

### `test-dev.sh` - Fast Development Testing
**Purpose:** Quick feedback during active development
**Duration:** 2-3 minutes
**When to use:** While coding, multiple times per day

**What it does:**
- ✅ Runs unit tests only (fastest feedback)
- ✅ Tests changed components in parallel
- ✅ Minimal Docker services (postgres, redis)
- ✅ Skips slow tests (chaos, performance)

```bash
./scripts/test-dev.sh
```

### `test-pre-commit.sh` - Comprehensive Pre-Commit Validation
**Purpose:** Thorough testing before committing code
**Duration:** 8-12 minutes
**When to use:** Before committing to git

**What it does:**
- ✅ Detects which components changed
- ✅ Runs comprehensive tests for changed components
- ✅ Includes integration tests
- ✅ Security scanning
- ✅ Generates coverage reports
- ✅ Smart test selection based on git changes

```bash
./scripts/test-pre-commit.sh
```

### `test-release.sh` - Full Release Validation
**Purpose:** Complete system validation including chaos testing
**Duration:** 20-30 minutes
**When to use:** Before releases, major deployments

**What it does:**
- ✅ All test types (unit, integration, security, performance)
- ✅ Chaos engineering tests (network failures, database crashes)
- ✅ Load testing and benchmarks
- ✅ Comprehensive security scanning
- ✅ Generates detailed release report

```bash
./scripts/test-release.sh

# Options:
./scripts/test-release.sh --no-chaos       # Skip chaos tests
./scripts/test-release.sh --no-performance # Skip performance tests
./scripts/test-release.sh --no-security    # Skip security tests
```

## 🔧 Advanced Usage

### Environment Variables

```bash
# Skip specific test types
export SKIP_CHAOS_TESTS=true
export SKIP_SDK_TESTS=true
export SKIP_BACKEND_TESTS=true

# Enable specific features
export CHAOS_TESTING=true
export PARALLEL_TESTS=true

# Custom configuration
export DATABASE_URL="postgres://user:pass@localhost:5432/testdb"
export X402_FACILITATOR_URL="https://api.x402.org"
```

### Custom Workflows

**For Backend-Only Changes:**
```bash
cd backend && ./test.sh
```

**For SDK-Only Changes:**
```bash
cd sdk/sdk-typescript && ./test.sh
cd sdk/python && ./test.sh
```

**For Quick Integration Test:**
```bash
docker-compose -f docker-compose.test.yml up -d
go test ./tests/e2e/... -v
docker-compose -f docker-compose.test.yml down
```

## 📊 Understanding Test Output

### Success Indicators
- ✅ Green checkmarks indicate passed tests
- 📊 Coverage reports generated automatically
- 🎉 Final success message confirms readiness

### Failure Indicators
- ❌ Red X marks indicate failed tests
- ⚠️ Yellow warnings for non-critical issues
- 💥 Error messages with specific failure details

### Generated Reports
- **Coverage:** `backend/coverage.html`, `sdk/*/coverage/`
- **Security:** `backend/gosec-report.json`
- **Performance:** `backend/benchmark-results.txt`
- **Release:** `test-results/release-report-YYYYMMDD-HHMMSS.md`

## 🐳 Docker Management

Scripts automatically manage Docker services, but for manual control:

```bash
# Start test services
docker-compose -f docker-compose.test.yml up -d

# View service status
docker-compose -f docker-compose.test.yml ps

# View logs
docker-compose -f docker-compose.test.yml logs -f

# Stop and clean up
docker-compose -f docker-compose.test.yml down -v
```

## 🔍 Troubleshooting

### Common Issues

**"Docker not running"**
```bash
# Start Docker Desktop or Docker service
sudo systemctl start docker  # Linux
open -a Docker               # Mac
```

**"Permission denied" on scripts**
```bash
chmod +x scripts/*.sh
```

**"Dependencies not found"**
```bash
./scripts/test-setup.sh  # Re-run setup
```

**"Tests hanging"**
```bash
# Kill hung processes
docker-compose -f docker-compose.test.yml down -v
pkill -f "go test"
pkill -f "pnpm"
pkill -f "pytest"
```

### Performance Issues

**Slow test execution:**
- Use `./scripts/test-dev.sh` for faster feedback
- Enable parallel testing: `PARALLEL_TESTS=true`
- Skip chaos tests during development

**Docker resource issues:**
- Increase Docker memory allocation (4GB+ recommended)
- Clean up unused containers: `docker system prune`

### Getting Help

1. **Check logs:** Test scripts show detailed error output
2. **Review documentation:** Read `TESTING.md` for comprehensive guide
3. **Manual testing:** Run individual components to isolate issues
4. **Reset environment:** Re-run `./scripts/test-setup.sh`

## 📈 Performance Expectations

| Script | Duration | Use Case |
|--------|----------|----------|
| `test-dev.sh` | 2-3 min | Active development |
| `test-pre-commit.sh` | 8-12 min | Pre-commit validation |
| `test-release.sh` | 20-30 min | Release preparation |

## 🎯 Best Practices

### Development Workflow
1. **Start development:** `./scripts/test-dev.sh` (verify clean state)
2. **During development:** `./scripts/test-dev.sh` (frequent validation)
3. **Before committing:** `./scripts/test-pre-commit.sh` (comprehensive check)
4. **Before releases:** `./scripts/test-release.sh` (full validation)

### CI/CD Integration
- **PRs:** Use `test-pre-commit.sh` equivalent in CI
- **Main branch:** Use `test-release.sh` equivalent in CI
- **Nightly:** Run `test-release.sh` with full chaos testing

### Team Collaboration
- Run `./scripts/test-pre-commit.sh` before pushing
- Include test results in PR descriptions
- Share release reports with stakeholders
- Document any test environment changes

---

These automated scripts eliminate the complexity of manual testing while ensuring comprehensive validation of your Sangria.NET system.