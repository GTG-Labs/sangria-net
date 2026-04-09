package auth

import (
	"context"
	"log"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TransactionResponse struct {
	ID             string `json:"id"`
	IdempotencyKey string `json:"idempotency_key"`
	CreatedAt      string `json:"created_at"`
	Amount         int64  `json:"amount"`
	Currency       string `json:"currency"`
	Network        string `json:"network"`
	Type           string `json:"type"`
}

// ListUserTransactions handles GET /transactions
// Returns all transactions where the authenticated user received payment
func ListUserTransactions(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		// Get authenticated user from WorkOS middleware
		user := c.Locals("workos_user").(WorkOSUser)

		transactions, err := fetchUserTransactions(c.Context(), pool, user.ID)
		if err != nil {
			log.Printf("Failed to fetch transactions for user %s: %v", user.ID, err)
			return c.Status(500).JSON(fiber.Map{"error": "Failed to retrieve transactions"})
		}

		return c.JSON(transactions)
	}
}

func fetchUserTransactions(ctx context.Context, pool *pgxpool.Pool, userID string) ([]TransactionResponse, error) {
	// SECURITY: Only return transactions for this specific user
	// Filter by user_id to prevent data leakage
	query := `
		SELECT
			t.id,
			t.idempotency_key,
			t.created_at,
			le.amount,
			le.currency,
			COALESCE(cw.network, '') as network
		FROM transactions t
		JOIN ledger_entries le ON le.transaction_id = t.id
		JOIN accounts a ON a.id = le.account_id
		LEFT JOIN crypto_wallets cw ON cw.account_id = a.id
		WHERE a.user_id = $1
		  AND a.type = 'LIABILITY'
		  AND le.direction = 'CREDIT'
		ORDER BY t.created_at DESC
		LIMIT 1000
	`

	rows, err := pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []TransactionResponse
	for rows.Next() {
		var tx TransactionResponse
		err := rows.Scan(
			&tx.ID,
			&tx.IdempotencyKey,
			&tx.CreatedAt,
			&tx.Amount,
			&tx.Currency,
			&tx.Network,
		)
		if err != nil {
			return nil, err
		}

		tx.Type = "payment_received"
		transactions = append(transactions, tx)
	}

	if transactions == nil {
		transactions = []TransactionResponse{}
	}

	return transactions, rows.Err()
}
