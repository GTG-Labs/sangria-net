package testutils

import (
	"context"
	"fmt"
	"log"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// TestDatabase represents a test database container
type TestDatabase struct {
	Container testcontainers.Container
	Pool      *pgxpool.Pool
	ConnStr   string
}

// SetupTestDatabase creates a PostgreSQL test container and returns a connection pool
func SetupTestDatabase(t *testing.T) *TestDatabase {
	t.Helper()

	ctx := context.Background()

	// Create PostgreSQL container
	postgresContainer, err := postgres.Run(ctx,
		"postgres:15-alpine",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("testuser"),
		postgres.WithPassword("testpass"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("Failed to start PostgreSQL container: %v", err)
	}

	// Get connection string
	connStr, err := postgresContainer.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("Failed to get connection string: %v", err)
	}

	// Create connection pool
	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		t.Fatalf("Failed to create connection pool: %v", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("Failed to ping database: %v", err)
	}

	return &TestDatabase{
		Container: postgresContainer,
		Pool:      pool,
		ConnStr:   connStr,
	}
}

// Cleanup closes the database connection and terminates the container
func (td *TestDatabase) Cleanup(t *testing.T) {
	t.Helper()

	ctx := context.Background()

	if td.Pool != nil {
		td.Pool.Close()
	}

	if td.Container != nil {
		if err := td.Container.Terminate(ctx); err != nil {
			t.Logf("Failed to terminate container: %v", err)
		}
	}
}

// CreateTestSchema creates the necessary database schema for tests
func (td *TestDatabase) CreateTestSchema(t *testing.T) {
	t.Helper()

	ctx := context.Background()

	// Basic schema creation - in real implementation, you'd run your actual migrations
	schema := `
		CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

		CREATE TABLE IF NOT EXISTS users (
			workos_id TEXT PRIMARY KEY,
			owner TEXT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS accounts (
			id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
			name TEXT NOT NULL,
			type TEXT NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
			currency TEXT NOT NULL CHECK (currency IN ('USD', 'USDC', 'ETH')),
			user_id TEXT REFERENCES users(workos_id),
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS transactions (
			id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
			idempotency_key TEXT UNIQUE NOT NULL,
			description TEXT,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS ledger_entries (
			id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
			transaction_id TEXT REFERENCES transactions(id),
			account_id TEXT REFERENCES accounts(id),
			currency TEXT NOT NULL CHECK (currency IN ('USD', 'USDC', 'ETH')),
			amount BIGINT NOT NULL,
			direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS crypto_wallets (
			id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
			address TEXT NOT NULL,
			network TEXT NOT NULL,
			account_id TEXT REFERENCES accounts(id),
			user_id TEXT REFERENCES users(workos_id),
			last_used_at TIMESTAMP WITH TIME ZONE,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS merchants (
			id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id TEXT NOT NULL REFERENCES users(workos_id),
			api_key TEXT UNIQUE NOT NULL,
			name TEXT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS merchant_keys (
			id TEXT PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id TEXT NOT NULL REFERENCES users(workos_id),
			api_key TEXT UNIQUE NOT NULL,
			api_key_hash TEXT NOT NULL,
			name TEXT NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
			last_used_at TIMESTAMP WITH TIME ZONE
		);
	`

	if _, err := td.Pool.Exec(ctx, schema); err != nil {
		t.Fatalf("Failed to create test schema: %v", err)
	}
}

// TruncateAllTables cleans all data from test tables
func (td *TestDatabase) TruncateAllTables(t *testing.T) {
	t.Helper()

	ctx := context.Background()

	tables := []string{
		"ledger_entries",
		"merchant_keys",
		"merchants",
		"crypto_wallets",
		"transactions",
		"accounts",
		"users",
	}

	for _, table := range tables {
		query := fmt.Sprintf("TRUNCATE TABLE %s CASCADE", table)
		if _, err := td.Pool.Exec(ctx, query); err != nil {
			log.Printf("Failed to truncate table %s: %v", table, err)
		}
	}
}

// InsertTestUser creates a test user
func (td *TestDatabase) InsertTestUser(t *testing.T, workosID, owner string) {
	t.Helper()

	ctx := context.Background()
	query := "INSERT INTO users (workos_id, owner) VALUES ($1, $2)"

	if _, err := td.Pool.Exec(ctx, query, workosID, owner); err != nil {
		t.Fatalf("Failed to insert test user: %v", err)
	}
}

// SetupTestWalletAndAccount creates a test crypto wallet with associated account for payment tests
func (td *TestDatabase) SetupTestWalletAndAccount(t *testing.T) {
	t.Helper()

	ctx := context.Background()

	// First, create an account
	accountID := "test-account-id"
	_, err := td.Pool.Exec(ctx,
		`INSERT INTO accounts (id, name, type, currency)
		 VALUES ($1, $2, $3, $4)`,
		accountID, "Test USDC Account", "ASSET", "USDC")
	if err != nil {
		t.Fatalf("Failed to create test account: %v", err)
	}

	// Then, create a crypto wallet linked to the account (using playground testnet wallet)
	_, err = td.Pool.Exec(ctx,
		`INSERT INTO crypto_wallets (id, address, network, account_id, last_used_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		"test-wallet-id", "0x22A171FAe9957a560B179AD4a87336933b0aEe61", "base", accountID, time.Now())
	if err != nil {
		t.Fatalf("Failed to create test crypto wallet: %v", err)
	}
}

// SetupTestMerchant creates a test merchant for authentication tests
func (td *TestDatabase) SetupTestMerchant(t *testing.T) {
	t.Helper()

	ctx := context.Background()

	// Create a test user first
	_, err := td.Pool.Exec(ctx,
		`INSERT INTO users (workos_id, owner) VALUES ($1, $2)`,
		"test-user-id", "test-user@example.com")
	if err != nil {
		t.Logf("User may already exist: %v", err) // Don't fail if user exists
	}

	// Create a test merchant
	_, err = td.Pool.Exec(ctx,
		`INSERT INTO merchants (id, user_id, api_key, name)
		 VALUES ($1, $2, $3, $4)`,
		"test-merchant-id", "test-user-id", "test-api-key", "Test Merchant")
	if err != nil {
		t.Fatalf("Failed to create test merchant: %v", err)
	}

	// Create a merchant liability account
	_, err = td.Pool.Exec(ctx,
		`INSERT INTO accounts (id, name, type, currency, user_id)
		 VALUES ($1, $2, $3, $4, $5)`,
		"test-merchant-liability-account-id", "Test Merchant USDC Liability", "LIABILITY", "USDC", "test-user-id")
	if err != nil {
		t.Fatalf("Failed to create merchant liability account: %v", err)
	}
}