package dbengine

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// validCurrencies is the set of currencies accepted by the ledger.
var validCurrencies = map[Currency]bool{
	USD: true, USDC: true, ETH: true,
}

// validDirections is the set of directions accepted by the ledger.
var validDirections = map[Direction]bool{
	Debit: true, Credit: true,
}

// InsertTransaction validates a batch of ledger lines for double-entry
// correctness (zero-net per currency) and atomically inserts them as a
// single transaction. Returns the inserted entries or a validation error.
func InsertTransaction(ctx context.Context, pool *pgxpool.Pool, lines []LedgerLine) ([]LedgerEntry, error) {
	if err := validateLines(lines); err != nil {
		return nil, err
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	txnID := uuid.New().String()
	entries := make([]LedgerEntry, len(lines))

	for i, line := range lines {
		var e LedgerEntry
		err := tx.QueryRow(ctx,
			`INSERT INTO ledger_entries
			   (transaction_id, currency, amount, direction,
			    asset_id, liability_id, expense_id, revenue_id)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING id, transaction_id, currency, amount, direction,
			           asset_id, liability_id, expense_id, revenue_id`,
			txnID, line.Currency, line.Amount, line.Direction,
			line.AssetID, line.LiabilityID, line.ExpenseID, line.RevenueID,
		).Scan(
			&e.ID, &e.TransactionID, &e.Currency, &e.Amount, &e.Direction,
			&e.AssetID, &e.LiabilityID, &e.ExpenseID, &e.RevenueID,
		)
		if err != nil {
			return nil, fmt.Errorf("insert ledger entry %d: %w", i, err)
		}
		entries[i] = e
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit transaction: %w", err)
	}

	return entries, nil
}

// validateLines runs all pre-insert checks on the batch of lines.
func validateLines(lines []LedgerLine) error {
	if len(lines) == 0 {
		return fmt.Errorf("transaction must have at least one line")
	}

	for i, line := range lines {
		if line.Amount <= 0 {
			return fmt.Errorf("line %d: amount must be positive, got %d", i, line.Amount)
		}
		if !validDirections[line.Direction] {
			return fmt.Errorf("line %d: invalid direction %q", i, line.Direction)
		}
		if !validCurrencies[line.Currency] {
			return fmt.Errorf("line %d: invalid currency %q", i, line.Currency)
		}
		if err := validateExactlyOneFK(i, line); err != nil {
			return err
		}
	}

	return validateZeroNet(lines)
}

// validateExactlyOneFK ensures exactly one foreign key is set per line.
func validateExactlyOneFK(i int, line LedgerLine) error {
	count := 0
	if line.AssetID != nil {
		count++
	}
	if line.LiabilityID != nil {
		count++
	}
	if line.ExpenseID != nil {
		count++
	}
	if line.RevenueID != nil {
		count++
	}
	if count != 1 {
		return fmt.Errorf("line %d: exactly one account FK must be set, got %d", i, count)
	}
	return nil
}

// validateZeroNet checks that debits and credits balance to zero for each currency.
func validateZeroNet(lines []LedgerLine) error {
	type balance struct {
		debits  int64
		credits int64
	}

	byCurrency := make(map[Currency]*balance)

	for _, line := range lines {
		b, ok := byCurrency[line.Currency]
		if !ok {
			b = &balance{}
			byCurrency[line.Currency] = b
		}
		switch line.Direction {
		case Debit:
			b.debits += line.Amount
		case Credit:
			b.credits += line.Amount
		}
	}

	for cur, b := range byCurrency {
		if b.debits != b.credits {
			return fmt.Errorf(
				"transaction does not balance for %s: debits=%d credits=%d",
				cur, b.debits, b.credits,
			)
		}
	}

	return nil
}
