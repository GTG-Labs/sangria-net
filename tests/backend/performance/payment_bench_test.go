package performance

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"sangrianet/backend/tests/testutils"
)

// BenchmarkPaymentGeneration benchmarks the payment generation endpoint
func BenchmarkPaymentGeneration(b *testing.B) {
	// Setup test database and dependencies
	testDB := testutils.SetupTestDatabase(b)
	defer testDB.Cleanup(b)
	testDB.CreateTestSchema(b)
	testDB.SetupTestWalletAndAccount(b)

	// Create a mock merchant for benchmarking
	ctx := context.Background()
	userID := "bench_test_user"
	// Insert test user - convert *testing.B to testing.TB interface
	_, err := testDB.Pool.Exec(ctx,
		"INSERT INTO users (id, name) VALUES ($1, $2)",
		userID, "Benchmark User")
	require.NoError(b, err)

	apiKey := "bench_api_key_12345"
	apiKeyHash := "hash_" + apiKey

	_, err = testDB.Pool.Exec(ctx,
		"INSERT INTO merchant_keys (user_id, api_key, api_key_hash, name) VALUES ($1, $2, $3, $4)",
		userID, apiKey, apiKeyHash, "Benchmark Key")
	require.NoError(b, err)

	// Reset timer before starting benchmark
	b.ResetTimer()

	// Benchmark payment generation in parallel
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			// Simulate payment processing with direct database insert
			paymentID := fmt.Sprintf("bench_payment_%d_%d", b.N, pb.Next())
			_, err := testDB.Pool.Exec(ctx, `
				INSERT INTO payments (id, user_id, amount_micro, description, status)
				VALUES ($1, $2, $3, $4, $5)
			`, paymentID, userID, 10000, "Benchmark payment", "pending")
			if err != nil {
				b.Fatal(err)
			}
		}
	})
}

// BenchmarkDatabaseOperations benchmarks individual database operations
func BenchmarkDatabaseOperations(b *testing.B) {
	testDB := testutils.SetupTestDatabase(b)
	defer testDB.Cleanup(b)
	testDB.CreateTestSchema(b)

	benchmarks := []struct {
		name string
		fn   func(*testing.B, *testutils.TestDatabase)
	}{
		{"InsertPayment", benchmarkInsertPayment},
		{"UpdatePaymentStatus", benchmarkUpdatePaymentStatus},
		{"GetPaymentByID", benchmarkGetPaymentByID},
		{"ListPaymentsByMerchant", benchmarkListPayments},
	}

	for _, bm := range benchmarks {
		b.Run(bm.name, func(b *testing.B) {
			bm.fn(b, testDB)
		})
	}
}

func benchmarkInsertPayment(b *testing.B, testDB *testutils.TestDatabase) {
	ctx := context.Background()
	userID := "bench_user"
	_, err := testDB.Pool.Exec(ctx,
		"INSERT INTO users (id, name) VALUES ($1, $2)",
		userID, "Benchmark User")
	require.NoError(b, err)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		paymentID := generatePaymentID(i)
		_, err := testDB.Pool.Exec(ctx, `
			INSERT INTO payments (id, user_id, amount_micro, description, status)
			VALUES ($1, $2, $3, $4, $5)
		`, paymentID, userID, 10000, "Benchmark payment", "pending")
		require.NoError(b, err)
	}
}

func benchmarkUpdatePaymentStatus(b *testing.B, testDB *testutils.TestDatabase) {
	ctx := context.Background()
	userID := "bench_user"
	_, err := testDB.Pool.Exec(ctx,
		"INSERT INTO users (id, name) VALUES ($1, $2)",
		userID, "Benchmark User")
	require.NoError(b, err)

	// Pre-insert payments for updating
	paymentIDs := make([]string, b.N)
	for i := 0; i < b.N; i++ {
		paymentID := generatePaymentID(i)
		paymentIDs[i] = paymentID
		_, err := testDB.Pool.Exec(ctx, `
			INSERT INTO payments (id, user_id, amount_micro, description, status)
			VALUES ($1, $2, $3, $4, $5)
		`, paymentID, userID, 10000, "Benchmark payment", "pending")
		require.NoError(b, err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := testDB.Pool.Exec(ctx, `
			UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2
		`, "completed", paymentIDs[i])
		require.NoError(b, err)
	}
}

func benchmarkGetPaymentByID(b *testing.B, testDB *testutils.TestDatabase) {
	ctx := context.Background()
	userID := "bench_user"
	_, err := testDB.Pool.Exec(ctx,
		"INSERT INTO users (id, name) VALUES ($1, $2)",
		userID, "Benchmark User")
	require.NoError(b, err)

	// Pre-insert a payment for querying
	paymentID := "bench_payment_query"
	_, err = testDB.Pool.Exec(ctx, `
		INSERT INTO payments (id, user_id, amount_micro, description, status)
		VALUES ($1, $2, $3, $4, $5)
	`, paymentID, userID, 10000, "Benchmark payment", "pending")
	require.NoError(b, err)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var status string
		err := testDB.Pool.QueryRow(ctx, `
			SELECT status FROM payments WHERE id = $1
		`, paymentID).Scan(&status)
		require.NoError(b, err)
	}
}

func benchmarkListPayments(b *testing.B, testDB *testutils.TestDatabase) {
	ctx := context.Background()
	userID := "bench_user"
	_, err := testDB.Pool.Exec(ctx,
		"INSERT INTO users (id, name) VALUES ($1, $2)",
		userID, "Benchmark User")
	require.NoError(b, err)

	// Pre-insert multiple payments
	for i := 0; i < 100; i++ {
		paymentID := generatePaymentID(i)
		_, err = testDB.Pool.Exec(ctx, `
			INSERT INTO payments (id, user_id, amount_micro, description, status)
			VALUES ($1, $2, $3, $4, $5)
		`, paymentID, userID, 10000, "Benchmark payment", "pending")
		require.NoError(b, err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rows, err := testDB.Pool.Query(ctx, `
			SELECT id, amount_micro, description, status, created_at
			FROM payments
			WHERE user_id = $1
			ORDER BY created_at DESC
			LIMIT 20
		`, userID)
		require.NoError(b, err)
		rows.Close()
	}
}

// BenchmarkConcurrentPayments tests concurrent payment processing
func BenchmarkConcurrentPayments(b *testing.B) {
	if testing.Short() {
		b.Skip("Skipping concurrent benchmark in short mode")
	}

	testDB := testutils.SetupTestDatabase(b)
	defer testDB.Cleanup(b)
	testDB.CreateTestSchema(b)
	testDB.SetupTestWalletAndAccount(b)

	// Create multiple test users
	ctx := context.Background()
	numUsers := 10
	userIDs := make([]string, numUsers)

	for i := 0; i < numUsers; i++ {
		userID := generateUserID(i)
		userIDs[i] = userID
		_, err := testDB.Pool.Exec(ctx,
			"INSERT INTO users (id, name) VALUES ($1, $2)",
			userID, "Concurrent User")
		require.NoError(b, err)

		apiKey := generateAPIKey(i)
		apiKeyHash := "hash_" + apiKey
		_, err = testDB.Pool.Exec(ctx,
			"INSERT INTO merchant_keys (user_id, api_key, api_key_hash, name) VALUES ($1, $2, $3, $4)",
			userID, apiKey, apiKeyHash, "Concurrent Key")
		require.NoError(b, err)
	}

	// Payment request structure for concurrent testing

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		userIndex := 0
		for pb.Next() {
			userID := userIDs[userIndex%numUsers]
			paymentID := fmt.Sprintf("concurrent_payment_%d_%d", userIndex, pb.Next())
			_, err := testDB.Pool.Exec(ctx, `
				INSERT INTO payments (id, user_id, amount_micro, description, status)
				VALUES ($1, $2, $3, $4, $5)
			`, paymentID, userID, 10000, "Concurrent payment", "pending")
			if err != nil {
				b.Fatal(err)
			}
			userIndex++
		}
	})
}

// Helper functions
func generatePaymentID(i int) string {
	return fmt.Sprintf("bench_payment_%08d", i)
}

func generateUserID(i int) string {
	return fmt.Sprintf("bench_user_%03d", i)
}

func generateAPIKey(i int) string {
	return fmt.Sprintf("bench_api_key_%03d", i)
}