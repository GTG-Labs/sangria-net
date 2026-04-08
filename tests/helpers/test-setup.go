package helpers

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// TestFixtures contains all test fixture data
type TestFixtures struct {
	Payments   PaymentFixtures   `json:"valid_payments"`
	Wallets    WalletFixtures    `json:"test_wallets"`
	APIKeys    APIKeyFixtures    `json:"test_api_keys"`
	Signatures SignatureFixtures `json:"valid_signatures"`
}

type PaymentFixtures []struct {
	ID            string  `json:"id"`
	Amount        float64 `json:"amount"`
	Description   string  `json:"description"`
	Resource      string  `json:"resource"`
	ExpectedMicro string  `json:"expected_micro"`
}

type WalletFixtures []struct {
	Name        string  `json:"name"`
	Address     string  `json:"address"`
	Network     string  `json:"network"`
	Balance     float64 `json:"balance"`
	Description string  `json:"description"`
}

type APIKeyFixtures []struct {
	Name        string   `json:"name"`
	APIKey      string   `json:"api_key"`
	APIKeyHash  string   `json:"api_key_hash"`
	UserID      string   `json:"user_id"`
	Permissions []string `json:"permissions"`
	Active      bool     `json:"active"`
}

type SignatureFixtures []struct {
	Name        string                 `json:"name"`
	ChainID     int                    `json:"chain_id"`
	Domain      map[string]interface{} `json:"domain"`
	Signature   string                 `json:"signature"`
	Payload     map[string]interface{} `json:"payload"`
	Description string                 `json:"description"`
}

// LoadTestFixtures loads all test fixture data from JSON files
func LoadTestFixtures(t *testing.T) *TestFixtures {
	fixtures := &TestFixtures{}

	// Load payments
	loadFixtureFile(t, "tests/fixtures/payments.json", &struct {
		ValidPayments []struct {
			ID            string  `json:"id"`
			Amount        float64 `json:"amount"`
			Description   string  `json:"description"`
			Resource      string  `json:"resource"`
			ExpectedMicro string  `json:"expected_micro"`
		} `json:"valid_payments"`
	}{}, &fixtures.Payments)

	// Load other fixtures...
	// (Additional loading logic for wallets, API keys, etc.)

	return fixtures
}

// SetupTestEnvironment prepares a complete test environment
func SetupTestEnvironment(t *testing.T, db *pgxpool.Pool) {
	ctx := context.Background()

	// Load fixtures
	fixtures := LoadTestFixtures(t)

	// Setup test wallets
	for _, wallet := range fixtures.Wallets {
		_, err := db.Exec(ctx, `
			INSERT INTO wallets (address, network, balance)
			VALUES ($1, $2, $3)
			ON CONFLICT (address, network) DO UPDATE SET balance = $3
		`, wallet.Address, wallet.Network, wallet.Balance)
		require.NoError(t, err)
	}

	// Setup test API keys
	for _, apiKey := range fixtures.APIKeys {
		if apiKey.Active {
			_, err := db.Exec(ctx, `
				INSERT INTO users (id, name)
				VALUES ($1, $2)
				ON CONFLICT (id) DO NOTHING
			`, apiKey.UserID, fmt.Sprintf("Test User %s", apiKey.UserID))
			require.NoError(t, err)

			_, err = db.Exec(ctx, `
				INSERT INTO merchant_keys (user_id, api_key, api_key_hash, name)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (api_key) DO NOTHING
			`, apiKey.UserID, apiKey.APIKey, apiKey.APIKeyHash, apiKey.Name)
			require.NoError(t, err)
		}
	}
}

// CleanupTestEnvironment removes test data
func CleanupTestEnvironment(t *testing.T, db *pgxpool.Pool) {
	ctx := context.Background()

	// Clean up in reverse order of dependencies
	tables := []string{"payments", "merchant_keys", "users", "wallets"}
	for _, table := range tables {
		_, err := db.Exec(ctx, fmt.Sprintf("DELETE FROM %s WHERE 1=1", table))
		require.NoError(t, err)
	}
}

func loadFixtureFile(t *testing.T, filename string, target interface{}, dest interface{}) {
	data, err := os.ReadFile(filename)
	require.NoError(t, err, "Failed to read fixture file: %s", filename)

	err = json.Unmarshal(data, target)
	require.NoError(t, err, "Failed to parse fixture file: %s", filename)
}