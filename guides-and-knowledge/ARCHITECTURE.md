# Sangria — Project Architecture & Flow

Sangria is an HTTP-native micropayment platform built on the **x402 protocol**. It enables developers to monetize API endpoints with USDC payments on Base, requiring zero gas from the client and settling on-chain in seconds.

---

## High-Level Architecture

```
┌──────────┐         ┌─────────────┐         ┌────────────────┐         ┌─────────────┐
│          │  HTTP   │   x402      │  402 +   │                │ verify  │             │
│   User   │────────>│  Endpoint   │  payment │  Sangria       │────────>│ Facilitator │
│          │<────────│  (Merchant) │  headers  │  Backend       │<────────│ (Coinbase)  │
│          │ response│             │         │                │ settle  │             │
└──────────┘         └─────────────┘         └───────┬────────┘         └─────────────┘
      │                                              │                        │
      │ extends                                      │                        │
      v                                              v                        v
┌──────────┐                                  ┌────────────┐          ┌─────────────┐
│ Sangria  │                                  │  Database  │          │  Base       │
│ SDK      │                                  │  (Users,   │          │  Blockchain │
│          │                                  │  Merchants,│          │  (USDC)     │
│ Wraps    │                                  │  Txns)     │          └─────────────┘
│ HTTPX    │                                  └────────────┘
└──────────┘
```

---

## Component Breakdown

### 1. User (Client / Buyer)

The end user interacts with x402-protected APIs through the **Sangria SDK**, which wraps HTTPX and transparently handles the payment negotiation.

- `sangria.post()`, `sangria.get()`, etc. behave like normal HTTP calls
- If the endpoint returns `402 Payment Required`, the SDK automatically:
  1. Reads the payment terms from the response
  2. Signs an **ERC-3009 TransferWithAuthorization** using the user's private key
  3. Retries the request with the signed payment in the `X-PAYMENT` header
- If the endpoint returns any other response, it passes through unchanged

**Key file:** `main.py` — demonstrates buyer client flow

### 2. Sangria SDK

A Python client library that extends HTTPX with x402 payment capabilities.

- Registers an "exact" EVM client for signing ERC-3009 authorizations
- Handles the full 402 negotiation loop transparently
- Supports both `exact` (fixed price) and `upto` (variable price) payment schemes
- Future: external language SDKs in Java, C#, Swift

**Dependencies:** `x402` (client protocol lib), `eth_account` (signing)

### 3. x402 Endpoint (Merchant Server)

A FastAPI server that protects API endpoints behind x402 paywalls.

```
GET  /          → Free health check
GET  /premium   → $0.0001 USDC per request (exact scheme)
GET  /variable  → $0.0001–$0.0005 random price (exact scheme)
POST /run       → Variable cost based on work performed (upto scheme)
```

When a protected endpoint is hit without payment:
1. Returns **HTTP 402** with a JSON body specifying: price, scheme, network, payTo address, USDC contract
2. The SDK intercepts this, signs payment, and retries

**Key file:** `merchant_server/app.py`

### 4. Sangria Backend

Handles the server-side business logic:

- **Accept Payment Requests** — Validates incoming `X-PAYMENT` headers
- **Verify & Settle via Facilitator** — Calls Coinbase's facilitator to verify signatures and submit blockchain transactions
- **Handle Treasury Crypto Wallet** — Manages the merchant's receiving wallet via CDP
- **Handle EIP-3009 Protocol** — Processes `TransferWithAuthorization` signatures
- **EIP-712 Typed Data** — Structured signature format used by ERC-3009
- **Transaction Mutexes** — Prevents double-processing of concurrent payments
- **Payment Caching** — 300-second cache for expensive operations (e.g., TinyFish automation)

**Future capabilities:**
- Fiat-to-crypto on-ramp (manual)
- Queue & batch transaction settlement
- EIP-3009 spec resolution

### 5. Sangria Frontend

A Next.js documentation site and merchant dashboard.

**Current features:**
- Landing page with protocol explanation and code examples
- Documentation pages (Getting Started, x402 Protocol, Variable Pricing, Architecture)
- Dark/light mode toggle

**Planned features (from diagram):**
- Login + Authentication
- Create API Keys (for merchants)
- Add money to wallet (fund accounts)

**Key files:** `frontend/app/page.tsx`, `frontend/app/docs/`

### 6. Database

Stores persistent state for the platform:
- **Users** — Buyer accounts and wallet associations
- **Merchants** — Merchant profiles, API keys, wallet addresses
- **Transactions** — Payment records, settlement receipts, tx hashes

### 7. Facilitator (Coinbase)

A trusted intermediary operated by Coinbase that:
- **Verifies** — Checks signature validity, wallet balance, nonce freshness
- **Settles** — Submits the signed ERC-3009 authorization to the blockchain
- **Covers gas** — The facilitator pays transaction gas fees, so the client pays zero gas

---

## Payment Flow (Step by Step)

```
User (SDK)                    Merchant Server               Facilitator            Blockchain
   │                               │                            │                      │
   │  1. GET /premium              │                            │                      │
   │──────────────────────────────>│                            │                      │
   │                               │                            │                      │
   │  2. 402 Payment Required      │                            │                      │
   │  {price, payTo, asset,        │                            │                      │
   │   network, scheme}            │                            │                      │
   │<──────────────────────────────│                            │                      │
   │                               │                            │                      │
   │  3. SDK signs ERC-3009        │                            │                      │
   │  (TransferWithAuthorization)  │                            │                      │
   │                               │                            │                      │
   │  4. Retry + X-PAYMENT header  │                            │                      │
   │──────────────────────────────>│                            │                      │
   │                               │  5. verify_payment()       │                      │
   │                               │─────────────────────────>│                      │
   │                               │  6. Valid ✓                │                      │
   │                               │<─────────────────────────│                      │
   │                               │                            │                      │
   │                               │  7. settle_payment()       │                      │
   │                               │─────────────────────────>│                      │
   │                               │                            │  8. Submit ERC-3009  │
   │                               │                            │─────────────────────>│
   │                               │                            │  9. USDC transferred │
   │                               │                            │<─────────────────────│
   │                               │  10. TX hash              │                      │
   │                               │<─────────────────────────│                      │
   │                               │                            │                      │
   │  11. 200 OK + response body   │                            │                      │
   │  + X-PAYMENT-RESPONSE header  │                            │                      │
   │<──────────────────────────────│                            │                      │
```

---

## Protocols & Standards

| Protocol | Role |
|----------|------|
| **x402** | HTTP-native payment protocol using the `402 Payment Required` status code |
| **ERC-3009** | USDC standard for gasless `TransferWithAuthorization` — allows third parties to submit pre-signed transfers |
| **EIP-712** | Typed structured data signing — the format used to sign ERC-3009 authorizations |

### Payment Schemes

| Scheme | Description | Use Case |
|--------|-------------|----------|
| **exact** | Fixed price known before the request | Simple API calls, static content |
| **upto** | Maximum price set upfront, actual price determined after work is done | LLM inference, automation tasks, variable-cost operations |

---

## Business Model

```
                    ┌─────────────────┐
                    │    Business     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              v              v              v
        ┌──────────┐  ┌──────────┐  ┌─────────────┐
        │ Frontend │  │ Backend  │  │   Clout /    │
        │ (Dash)   │  │ (API)    │  │   Marketing  │
        └──────────┘  └──────────┘  └─────────────┘
              │              │              │
              │              │              ├── Blog Posts
              │              │              │   • What is x402?
              │              │              │   • EIP3009 & EIP712 spec
              │              │              │   • Facilitator explained
              │              │              │   • Is USDC safe?
              │              │
         Merchants      Users/Devs
              │              │
              v              v
     Sangria Python    Sangria Python
     API (server)      SDK (client)
              │
              v
         Core: Main Agent Wrapper
```

### Actors

- **Merchant** — Integrates via the **Sangria Python API** (server-side) to protect their endpoints
- **User** — Integrates via the **Sangria Python SDK** (client-side) to make paid API calls

### Backend Responsibilities

- Accept payment requests and create settlement contracts
- Handle treasury crypto wallet management
- Process EIP-3009 protocol interactions
- Fiat-to-crypto conversion (manual, future)
- Queue future/batch transactions
- Enforce transaction mutexes for concurrency safety

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Client SDK | Python, HTTPX, x402, eth_account |
| Merchant Server | FastAPI, fastapi-x402, Uvicorn |
| Wallet Management | Coinbase Developer Platform (CDP) SDK |
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Blockchain | Base Sepolia (testnet), USDC |
| Signing | ERC-3009 / EIP-712 via eth_account |
| Package Managers | uv (Python), pnpm (Node) |

---

## Network & Contract Details

| Parameter | Value |
|-----------|-------|
| Network | Base Sepolia (testnet) |
| USDC Contract | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Merchant Wallet | `0xF44cc4b82470Eb3D1fDAc83b8b7226d7cD07fd39` |
| Buyer Wallet | `0x0b7b1E88e321C3f326776e35C042bb3d035Be649` |
| Settlement Time | ~3 seconds |
| Gas Cost to Client | $0 (facilitator covers gas) |

---

## Security Considerations

- **CDP key management** — Private keys stored server-side by Coinbase, encrypted with `CDP_WALLET_SECRET`. Losing the secret = losing wallet access.
- **Client-side signing only** — Private keys exported from CDP only momentarily for ERC-3009 signature generation.
- **Nonce protection** — Each ERC-3009 authorization has a unique nonce, preventing replay attacks.
- **Facilitator trust** — Coinbase operates the facilitator; it must be trusted to verify and settle honestly.
- **Transaction mutexes** — Prevent double-settlement of concurrent payment requests.
- **Testnet only** — Currently running on Base Sepolia with test USDC. No real funds involved.
