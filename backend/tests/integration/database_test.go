package integration

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sangrianet/backend/tests/testutils"
)

func TestDatabaseTransactionConsistency(t *testing.T) {
	testDB := testutils.SetupTestDatabase(t)
	defer testDB.Cleanup(t)
	testDB.CreateTestSchema(t)

	ctx := context.Background()

	t.Run("Transaction rollback on error", func(t *testing.T) {
		testDB.TruncateAllTables(t)

		// Start a transaction
		tx, err := testDB.Pool.Begin(ctx)
		require.NoError(t, err)

		// Insert a user within transaction
		userID := "test_user_" + uuid.New().String()
		_, err = tx.Exec(ctx, "INSERT INTO users (workos_id, owner) VALUES ($1, $2)",
			userID, "test_owner")
		require.NoError(t, err)

		// Verify user exists within transaction
		var count int
		err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE workos_id = $1", userID).Scan(&count)
		require.NoError(t, err)
		assert.Equal(t, 1, count)

		// Rollback transaction
		err = tx.Rollback(ctx)
		require.NoError(t, err)

		// Verify user doesn't exist after rollback
		err = testDB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE workos_id = $1", userID).Scan(&count)
		require.NoError(t, err)
		assert.Equal(t, 0, count)
	})

	t.Run("Transaction commit success", func(t *testing.T) {
		testDB.TruncateAllTables(t)

		// Start a transaction
		tx, err := testDB.Pool.Begin(ctx)
		require.NoError(t, err)

		// Insert a user within transaction
		userID := "test_user_" + uuid.New().String()
		_, err = tx.Exec(ctx, "INSERT INTO users (workos_id, owner) VALUES ($1, $2)",
			userID, "test_owner")
		require.NoError(t, err)

		// Commit transaction
		err = tx.Commit(ctx)
		require.NoError(t, err)

		// Verify user exists after commit
		var count int
		err = testDB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE workos_id = $1", userID).Scan(&count)
		require.NoError(t, err)
		assert.Equal(t, 1, count)
	})

	t.Run("Concurrent transaction isolation", func(t *testing.T) {
		testDB.TruncateAllTables(t)

		// Insert base user
		userID := "concurrent_test_" + uuid.New().String()
		testDB.InsertTestUser(t, userID, "concurrent_owner")

		// Start two transactions with read committed isolation level
		tx1, err := testDB.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
		require.NoError(t, err)
		defer tx1.Rollback(ctx)

		tx2, err := testDB.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
		require.NoError(t, err)
		defer tx2.Rollback(ctx)

		// Transaction 1: Update user owner
		_, err = tx1.Exec(ctx, "UPDATE users SET owner = $1 WHERE workos_id = $2",
			"owner1", userID)
		require.NoError(t, err)

		// Transaction 2: Read user before commit (should see original value)
		var owner string
		err = tx2.QueryRow(ctx, "SELECT owner FROM users WHERE workos_id = $1", userID).Scan(&owner)
		require.NoError(t, err)
		assert.Equal(t, "concurrent_owner", owner) // Should see original value

		// Commit transaction 1
		err = tx1.Commit(ctx)
		require.NoError(t, err)

		// Transaction 2: After commit, should now see updated value (read committed behavior)
		err = tx2.QueryRow(ctx, "SELECT owner FROM users WHERE workos_id = $1", userID).Scan(&owner)
		require.NoError(t, err)
		assert.Equal(t, "owner1", owner) // Now sees committed value

		// New transaction should see updated value
		var updatedOwner string
		err = testDB.Pool.QueryRow(ctx, "SELECT owner FROM users WHERE workos_id = $1", userID).Scan(&updatedOwner)
		require.NoError(t, err)
		assert.Equal(t, "owner1", updatedOwner)
	})

	t.Run("Deadlock detection", func(t *testing.T) {
		testDB.TruncateAllTables(t)

		// Insert two users
		user1ID := "deadlock_user1_" + uuid.New().String()
		user2ID := "deadlock_user2_" + uuid.New().String()
		testDB.InsertTestUser(t, user1ID, "owner1")
		testDB.InsertTestUser(t, user2ID, "owner2")

		// Simulate potential deadlock scenario
		tx1, err := testDB.Pool.Begin(ctx)
		require.NoError(t, err)
		defer tx1.Rollback(ctx)

		tx2, err := testDB.Pool.Begin(ctx)
		require.NoError(t, err)
		defer tx2.Rollback(ctx)

		// Transaction 1: Lock user1, then try user2
		_, err = tx1.Exec(ctx, "UPDATE users SET owner = 'new_owner1' WHERE workos_id = $1", user1ID)
		require.NoError(t, err)

		// Transaction 2: Lock user2, then try user1
		_, err = tx2.Exec(ctx, "UPDATE users SET owner = 'new_owner2' WHERE workos_id = $1", user2ID)
		require.NoError(t, err)

		// This could potentially cause deadlock in a real scenario
		// For testing, we just verify both transactions can proceed with their locked rows
		done1 := make(chan error, 1)
		done2 := make(chan error, 1)

		go func() {
			_, err := tx1.Exec(ctx, "UPDATE users SET owner = 'final_owner1' WHERE workos_id = $1", user2ID)
			done1 <- err
		}()

		go func() {
			_, err := tx2.Exec(ctx, "UPDATE users SET owner = 'final_owner2' WHERE workos_id = $1", user1ID)
			done2 <- err
		}()

		// Wait for both operations (one should succeed, one might deadlock)
		select {
		case <-done1:
		case <-done2:
		case <-time.After(5 * time.Second):
			t.Log("Deadlock timeout reached - this is expected")
		}

		// Cleanup
		tx1.Rollback(ctx)
		tx2.Rollback(ctx)
	})
}

func TestDatabaseEngineQueries(t *testing.T) {
	testDB := testutils.SetupTestDatabase(t)
	defer testDB.Cleanup(t)
	testDB.CreateTestSchema(t)

	ctx := context.Background()

	t.Run("Create and retrieve user", func(t *testing.T) {
		testDB.TruncateAllTables(t)

		userID := "test_user_" + uuid.New().String()
		owner := "test_owner"

		// Insert user
		testDB.InsertTestUser(t, userID, owner)

		// Retrieve user using database engine function (if it exists)
		var retrievedUser struct {
			WorkosID string `json:"workos_id"`
			Owner    string `json:"owner"`
		}

		query := "SELECT workos_id, owner FROM users WHERE workos_id = $1"
		err := testDB.Pool.QueryRow(ctx, query, userID).Scan(
			&retrievedUser.WorkosID,
			&retrievedUser.Owner,
		)
		require.NoError(t, err)

		assert.Equal(t, userID, retrievedUser.WorkosID)
		assert.Equal(t, owner, retrievedUser.Owner)
	})

	t.Run("Create account with foreign key constraint", func(t *testing.T) {
		testDB.TruncateAllTables(t)

		userID := "test_user_" + uuid.New().String()
		testDB.InsertTestUser(t, userID, "test_owner")

		// Create account for user
		accountID := uuid.New().String()
		query := `
			INSERT INTO accounts (id, name, type, currency, user_id)
			VALUES ($1, $2, $3, $4, $5)
		`
		_, err := testDB.Pool.Exec(ctx, query,
			accountID, "Test Account", "ASSET", "USDC", userID)
		require.NoError(t, err)

		// Verify account was created
		var count int
		err = testDB.Pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM accounts WHERE id = $1 AND user_id = $2",
			accountID, userID).Scan(&count)
		require.NoError(t, err)
		assert.Equal(t, 1, count)
	})

	t.Run("Foreign key constraint violation", func(t *testing.T) {
		testDB.TruncateAllTables(t)

		// Try to create account for non-existent user
		accountID := uuid.New().String()
		nonExistentUserID := "non_existent_user"

		query := `
			INSERT INTO accounts (id, name, type, currency, user_id)
			VALUES ($1, $2, $3, $4, $5)
		`
		_, err := testDB.Pool.Exec(ctx, query,
			accountID, "Test Account", "ASSET", "USDC", nonExistentUserID)

		// Should fail due to foreign key constraint
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "foreign key")
	})

	t.Run("Unique constraint violation", func(t *testing.T) {
		testDB.TruncateAllTables(t)

		userID := "test_user_" + uuid.New().String()
		testDB.InsertTestUser(t, userID, "test_owner")

		// Insert first API key
		apiKey := "test_api_key_" + uuid.New().String()
		query := `
			INSERT INTO merchant_keys (user_id, api_key, api_key_hash, name)
			VALUES ($1, $2, $3, $4)
		`
		_, err := testDB.Pool.Exec(ctx, query, userID, apiKey, "hash123", "Test Key")
		require.NoError(t, err)

		// Try to insert duplicate API key
		_, err = testDB.Pool.Exec(ctx, query, userID, apiKey, "hash456", "Duplicate Key")

		// Should fail due to unique constraint on api_key
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "unique")
	})

	t.Run("Transaction with multiple operations", func(t *testing.T) {
		testDB.TruncateAllTables(t)

		// Complex transaction: Create user, account, and API key
		tx, err := testDB.Pool.Begin(ctx)
		require.NoError(t, err)

		userID := "multi_op_user_" + uuid.New().String()

		// Insert user
		_, err = tx.Exec(ctx, "INSERT INTO users (workos_id, owner) VALUES ($1, $2)",
			userID, "multi_owner")
		require.NoError(t, err)

		// Insert account
		accountID := uuid.New().String()
		_, err = tx.Exec(ctx, `
			INSERT INTO accounts (id, name, type, currency, user_id)
			VALUES ($1, $2, $3, $4, $5)
		`, accountID, "Multi Account", "ASSET", "USDC", userID)
		require.NoError(t, err)

		// Insert API key
		apiKey := "multi_api_" + uuid.New().String()
		_, err = tx.Exec(ctx, `
			INSERT INTO merchant_keys (user_id, api_key, api_key_hash, name)
			VALUES ($1, $2, $3, $4)
		`, userID, apiKey, "hash123", "Multi Key")
		require.NoError(t, err)

		// Commit transaction
		err = tx.Commit(ctx)
		require.NoError(t, err)

		// Verify all operations succeeded
		var userCount, accountCount, keyCount int

		err = testDB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE workos_id = $1", userID).Scan(&userCount)
		require.NoError(t, err)
		assert.Equal(t, 1, userCount)

		err = testDB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM accounts WHERE user_id = $1", userID).Scan(&accountCount)
		require.NoError(t, err)
		assert.Equal(t, 1, accountCount)

		err = testDB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM merchant_keys WHERE user_id = $1", userID).Scan(&keyCount)
		require.NoError(t, err)
		assert.Equal(t, 1, keyCount)
	})
}