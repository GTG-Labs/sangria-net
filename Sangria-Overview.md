# Sangria Overview

## What Sangria is

Sangria is a **digital financial bridge** that connects **fiat-funded digital wallets** to the **x402 HTTP-native payment protocol**, enabling programmatic micropayments using **pre-funded credits**.

## Account types

Each user can have one of two account types on Sangria, with different capabilities.

1. **Client account**: can purchase **Sangria Credits** and use them to pay for requests on the platform. Client accounts cannot withdraw funds from a Sangria wallet to a personal bank account.
2. **Merchant account**: can withdraw money from a Sangria wallet to a personal bank account. Merchant accounts do not purchase credits.

## End-to-end operational flow

Sangria supports three transaction scenarios depending on which parties are on the platform. **Scenario 1 is live today**; Scenarios 2 and 3 are planned.

| Scenario       | Client                | Merchant            | Settlement method                                        | Status        |
| -------------- | --------------------- | ------------------- | -------------------------------------------------------- | ------------- |
| **Scenario 1** | External (raw wallet) | On Sangria          | On-chain USDC → Sangria credits merchant in fiat balance | **Supported** |
| **Scenario 2** | On Sangria (Credits)  | External (raw x402) | Sangria Treasury pays USDC on-chain on client's behalf   | Planned       |
| **Scenario 3** | On Sangria (Credits)  | On Sangria          | Internal ledger debit/credit (no blockchain)             | Planned       |

### Scenario 1 — Client external, Merchant on Sangria _(supported)_

The client is a raw x402 wallet paying in USDC. The merchant is on Sangria and receives a fiat-denominated balance.

**Flow**

1. External client follows normal x402 flow, signs the **ERC-3009 TransferWithAuthorization** with its own wallet, and pays USDC to **Sangria's Hot Wallet** (assigned to the merchant).
2. Hot wallet receives USDC on-chain.
3. Sangria converts USDC → fiat via off-ramp.
4. Sangria credits merchant's Sangria account balance (minus platform fee).
5. Merchant releases data once settlement confirms.

### Scenario 2 — Client on Sangria, Merchant external _(planned)_

The client uses **Sangria Credits**. The merchant is a raw x402 endpoint and receives **USDC directly on-chain**.

**Key idea:** the client never holds USDC. Sangria's **Treasury Wallet** holds USDC and pays merchants on the client's behalf. Credits are the internal accounting layer.

**Phase I — On-ramping (credit purchase)**

1. **Wallet funding**: user funds a Sangria wallet with fiat, converted into internal credits.
2. **Credit issuance**: Sangria updates the internal ledger and holds equivalent USDC in the Treasury Wallet.

**Phase II — The x402 request loop**

1. **Initial request**: user (via Sangria SDK) calls a protected endpoint.
2. **402 challenge**: merchant returns `HTTP 402 Payment Required` with headers specifying price, recipient, and network.
3. **Credit check & authorization creation**: SDK verifies sufficient credits and requests payment authorization from Sangria backend; an **ERC-3009 TransferWithAuthorization** must be signed **server-side only** by secure treasury/orchestration systems holding the **Treasury Wallet** key material, never by client-side SDKs.

**Security note:** Treasury private keys must remain in hardened custody (for example HSM/KMS-backed signing). Recommended flow: SDK sends payment intent/context to backend → backend validates credits/policy limits and challenge fields → backend signs ERC-3009 authorization in secure infrastructure → backend returns signed payload for submission.

**Phase III — Settlement & delivery**

1. **Payment submission**: SDK retries with the authorization in `PAYMENT-SIGNATURE`.
2. **Verify & settle**: merchant calls the **Facilitator (Coinbase)** to verify signature and settle on Base.
3. **Data release**: user receives data and a TX hash receipt.
4. **Ledger update**: Sangria deducts the equivalent credits from the user balance.

### Scenario 3 — Both client and merchant are on Sangria _(planned)_

Both parties hold credits. No blockchain interaction is needed.

**Flow**

1. Request to a Sangria-registered endpoint.
2. Backend checks user credits.
3. **Atomic ledger update**: debit user credits, credit merchant credits in a single DB transaction.
4. Merchant returns data.
5. Both parties receive an internal receipt.

## Protocols & standards

| Protocol / standard | Role                                                                                |
| ------------------- | ----------------------------------------------------------------------------------- |
| **x402**            | HTTP-native payment protocol using `402 Payment Required`                           |
| **ERC-3009**        | USDC gasless `TransferWithAuthorization` (third party submits pre-signed transfers) |
| **EIP-712**         | Typed structured data signing format used for ERC-3009 authorizations               |
