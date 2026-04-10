# Sangria SDK Deployment Guide

This document outlines the **manual deployment process** for both TypeScript and Python SDKs.

## 📦 Published Packages

- **TypeScript**: `sangria` on [npm](https://www.npmjs.com/package/sangria)
- **Python**: `sangria` on [PyPI](https://pypi.org/project/sangria/)

## 🚀 Manual Release Process

### Option 1: GitHub Actions Manual Workflow (Recommended)

Trigger releases through GitHub Actions interface:

1. Go to **Actions** → **Release SDKs**
2. Click **Run workflow**
3. Configure release:
   - **Version**: `0.1.1` (or leave blank for auto-increment)
   - **Release type**: `patch` / `minor` / `major`
   - **Dry run**: ☑️ (test without actually publishing)
4. Click **Run workflow**

The workflow will:
1. ✅ Run comprehensive test suite (151 tests)
2. 📝 Update both package versions automatically
3. 🔨 Build TypeScript + Python SDKs
4. 📦 Publish to npm + PyPI
5. 🏷️ Create GitHub release with changelog

### Option 2: Local Release Script

Use the interactive script for local control:

```bash
# Patch version (0.1.0 → 0.1.1)
./scripts/release.sh patch

# Minor version (0.1.0 → 0.2.0)
./scripts/release.sh minor

# Major version (0.1.0 → 1.0.0)
./scripts/release.sh major

# Custom version
./scripts/release.sh custom 0.1.2-beta.1
```

The script will:
1. ✅ Run comprehensive test suite
2. 📝 Update package versions in both SDKs
3. 🔨 Build both packages locally
4. 📋 Show release summary
5. 🏷️ Create git commit and tag
6. ⚠️ **Note**: You still need to manually trigger GitHub Actions to publish

## 🔧 Setup Requirements

### Repository Secrets

Configure these secrets in GitHub repository settings:

```bash
# npm publishing
NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# PyPI publishing
PYPI_TOKEN=pypi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# TestPyPI for dry runs (optional)
TEST_PYPI_TOKEN=pypi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Local Development

1. **Node.js & pnpm**:
   ```bash
   node --version  # >= 18
   pnpm --version  # >= 8
   ```

2. **Python**:
   ```bash
   python --version  # >= 3.10
   pip install build twine
   ```

## 📋 Pre-Release Checklist

- [ ] All tests passing (`pnpm test:all` in tests/)
- [ ] Clean git working directory
- [ ] Updated documentation if needed
- [ ] Version numbers aligned across packages
- [ ] CHANGELOG.md updated (if applicable)

## 🏗️ Package Structure

### TypeScript SDK (sangria)

```
sdk/sdk-typescript/
├── package.json       # Package config
├── src/              # Source code
├── dist/             # Built output (git-ignored)
└── README.md         # Package docs
```

**Exports:**
- `sangria` - Core SDK
- `sangria/express` - Express middleware
- `sangria/fastify` - Fastify plugin
- `sangria/hono` - Hono middleware

### Python SDK (sangria)

```
sdk/python/
├── pyproject.toml    # Package config
├── src/sangria_sdk/  # Source code
├── dist/             # Built output (git-ignored)
└── README.md         # Package docs
```

**Modules:**
- `sangria_sdk.client` - HTTP client
- `sangria_sdk.adapters.fastapi` - FastAPI decorator
- `sangria_sdk.models` - Data models

## 🔄 Version Management

Both packages maintain synchronized versions:

- **Development**: `0.x.x` (pre-1.0 releases)
- **Production**: `1.x.x+` (stable API)
- **Pre-releases**: `x.x.x-beta.x`, `x.x.x-alpha.x`

### Semantic Versioning

- **MAJOR** (`1.0.0`): Breaking API changes
- **MINOR** (`0.1.0`): New features, backward compatible
- **PATCH** (`0.0.1`): Bug fixes, backward compatible

## 🚧 Manual Release Pipeline

### Workflow Steps (Manual Trigger Only)

1. **Lint & Type Check**: ESLint, TypeScript, Black, mypy
2. **Test Suite**: Unit, integration, security, E2E tests
3. **Build**: TypeScript compilation, Python wheel/sdist
4. **Publish**: npm and PyPI deployment (**manual trigger only**)
5. **Release**: GitHub release with changelog

### Branch Strategy

- `main`: Stable codebase (**no auto-deploy**)
- `dev`: Development branch
- `feature/*`: Feature development
- `hotfix/*`: Critical fixes

**Note**: No automatic deployment occurs. All releases must be manually triggered.

## 🔍 Quality Gates

All releases must pass:

- ✅ **100%** test suite (151 tests)
- ✅ **Lint** checks (ESLint, Black)
- ✅ **Type** checks (TypeScript, mypy)
- ✅ **Security** scans (ESLint security, Bandit)
- ✅ **Build** verification (both SDKs)

## 📊 Monitoring

### Package Health

- npm: https://www.npmjs.com/package/sangria
- PyPI: https://pypi.org/project/sangria/
- GitHub Releases: https://github.com/GTG-Labs/sangria-net/releases

### Download Stats

```bash
# npm downloads
npm info sangria

# PyPI downloads (requires pypinfo)
pypinfo sangria
```

## 🆘 Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Clean and rebuild
cd sdk/sdk-typescript && rm -rf dist node_modules && pnpm install && pnpm build
cd sdk/python && rm -rf dist build && python -m build
```

**Test Failures:**
```bash
# Run tests locally
cd tests && pnpm test:all
```

**Version Misalignment:**
```bash
# Check versions
node -p "require('./sdk/sdk-typescript/package.json').version"
grep "version =" sdk/python/pyproject.toml
```

**Publishing Failures:**
- Verify secrets are configured
- Check package registry status
- Ensure version hasn't been published before

## 📞 Support

For deployment issues:
1. Check [GitHub Actions logs](https://github.com/GTG-Labs/sangria-net/actions)
2. Review [Issues](https://github.com/GTG-Labs/sangria-net/issues)
3. Contact maintainers

---

**Next Steps**: Ready to release? Run `./scripts/release.sh` to get started! 🚀