# dbEngine

Double-entry ledger engine and account management layer. Sits between the Fiber HTTP handlers and Postgres.

## Core invariant

**Every transaction must net to zero per currency.** If you debit 10 USDC somewhere, you must credit 10 USDC somewhere else. This is what keeps the books balanced.

```
Deposit 10 USDC:

  DEBIT   10,000,000  Asset (platform wallet)     USDC
  CREDIT  10,000,000  Liability (user balance)    USDC
  ─────────────────────────────────────────────────────
  Net:             0                               OK
```

Amounts are positive integers in microunits (1 USDC = 1,000,000). Direction (`DEBIT`/`CREDIT`) determines sign. No signed amounts, no ambiguity.

## Files

| File | Purpose |
|------|---------|
| `engine.go` | `Connect(ctx, connStr)` — creates and pings a `pgxpool.Pool` |
| `models.go` | Go structs mirroring the Drizzle schema. `Currency` and `Direction` typed enums |
| `creation.go` | `CreateAsset`, `CreateLiability`, `CreateExpense`, `CreateRevenue` |
| `queries.go` | Read queries — list accounts, ledger entries, balances |
| `transaction.go` | `InsertTransaction` — zero-net enforced ledger writes |

## Transaction engine

### `InsertTransaction(ctx, pool, lines []LedgerLine) ([]LedgerEntry, error)`

Validates a batch of ledger lines, then atomically inserts them under a shared `transaction_id`.

### Validation rules

All checks run **before** touching the database:

| # | Rule | Rejected with |
|---|------|---------------|
| 1 | Batch is empty | `transaction must have at least one line` |
| 2 | Amount <= 0 | `line N: amount must be positive, got X` |
| 3 | Invalid direction | `line N: invalid direction "X"` |
| 4 | Invalid currency | `line N: invalid currency "X"` |
| 5 | Zero or multiple account FKs | `line N: exactly one account FK must be set, got X` |
| 6 | Debits != credits for any currency | `transaction does not balance for X: debits=A credits=B` |

### Insert flow

1. Validate all lines (rules above)
2. `BEGIN` Postgres transaction
3. Generate shared `transaction_id` (UUID v4)
4. Insert each line as a `ledger_entry` row
5. `COMMIT`

Failure at any step rolls back. Nothing partial hits the database.

## Models

### Account types

Four account types, each with its own table:

- **Asset** — things the platform owns (e.g. USDC wallet)
- **Liability** — obligations to users (e.g. user balances)
- **Expense** — costs incurred (e.g. fees paid)
- **Revenue** — income earned (e.g. fees collected)

### `LedgerLine` (input)

```go
type LedgerLine struct {
    Currency    Currency   // USD, USDC, ETH
    Amount      int64      // positive, in microunits
    Direction   Direction  // DEBIT or CREDIT
    AssetID     *string    // exactly one of these four must be set
    LiabilityID *string
    ExpenseID   *string
    RevenueID   *string
}
```

### `LedgerEntry` (output)

Same fields as `LedgerLine` plus `ID` and `TransactionID`, populated after insert.

## Queries

| Function | Description |
|----------|-------------|
| `GetAllAssets` | List all asset accounts |
| `GetAllLiabilities` | List all liability accounts |
| `GetAllExpenses` | List all expense accounts |
| `GetAllRevenues` | List all revenue accounts |
| `GetAllLedgerEntries` | List all ledger entries ordered by transaction |
| `GetLedgerEntriesByTransaction(txID)` | Entries for a specific transaction |
| `GetLiabilityBalance(liabilityID, currency)` | Net balance (credits - debits) for a liability account |

## Schema

The TypeScript Drizzle schema in `dbSchema/schema.ts` is the source of truth. The Go structs here mirror those tables. When the schema changes, update `models.go` to match.
