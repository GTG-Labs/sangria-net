package chaos

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ChaosTest runs chaos engineering tests
func TestChaosEngineering(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping chaos tests in short mode")
	}

	// Check if we're in chaos testing environment
	if os.Getenv("CHAOS_TESTING") != "true" {
		t.Skip("Chaos testing requires CHAOS_TESTING=true environment variable")
	}

	baseURL := getEnvOrDefault("SANGRIA_TEST_URL", "http://localhost:8000")

	t.Run("Database failure resilience", func(t *testing.T) {
		testDatabaseFailureResilience(t, baseURL)
	})

	t.Run("Facilitator failure resilience", func(t *testing.T) {
		testFacilitatorFailureResilience(t, baseURL)
	})

	t.Run("Network partition resilience", func(t *testing.T) {
		testNetworkPartitionResilience(t, baseURL)
	})

	t.Run("High load behavior", func(t *testing.T) {
		testHighLoadBehavior(t, baseURL)
	})
}

func testDatabaseFailureResilience(t *testing.T, baseURL string) {
	client := &http.Client{Timeout: 10 * time.Second}

	// Test normal operation first
	err := makePaymentRequest(client, baseURL)
	require.NoError(t, err, "Baseline payment request should succeed")

	// Simulate database failure using Toxiproxy
	err = injectDatabaseFailure()
	if err != nil {
		t.Logf("Failed to inject database failure: %v", err)
		return
	}
	defer healDatabaseFailure()

	// System should handle database failures gracefully
	retryCount := 0
	maxRetries := 5

	for i := 0; i < 10; i++ {
		err := makePaymentRequest(client, baseURL)
		if err != nil {
			retryCount++
			if retryCount > maxRetries {
				t.Logf("Payment failed after database failure (attempt %d): %v", i+1, err)
				// This is expected during database failures
			}
		} else {
			t.Logf("Payment succeeded during database failure (attempt %d)", i+1)
		}
		time.Sleep(2 * time.Second)
	}

	// System should recover after healing
	time.Sleep(5 * time.Second)
	err = makePaymentRequest(client, baseURL)
	assert.NoError(t, err, "System should recover after database healing")
}

func testFacilitatorFailureResilience(t *testing.T, baseURL string) {
	client := &http.Client{Timeout: 15 * time.Second}

	// Test normal operation first
	err := makePaymentRequest(client, baseURL)
	require.NoError(t, err, "Baseline payment request should succeed")

	// Inject facilitator failure
	err = injectFacilitatorFailure()
	if err != nil {
		t.Logf("Failed to inject facilitator failure: %v", err)
		return
	}
	defer healFacilitatorFailure()

	// Test with facilitator failures
	failureCount := 0
	successCount := 0

	for i := 0; i < 20; i++ {
		err := makePaymentRequest(client, baseURL)
		if err != nil {
			failureCount++
		} else {
			successCount++
		}
		time.Sleep(1 * time.Second)
	}

	t.Logf("Facilitator failure test: %d successes, %d failures", successCount, failureCount)

	// During facilitator failures, most requests should fail
	assert.Greater(t, failureCount, 0, "Some payments should fail due to facilitator issues")

	// Failure rate should be high when facilitator is down
	failureRate := float64(failureCount) / float64(failureCount + successCount)
	assert.Greater(t, failureRate, 0.5, "Failure rate should be greater than 50% when facilitator is down")

	// Heal facilitator failure and test recovery
	err = healFacilitatorFailure()
	if err != nil {
		t.Logf("Failed to heal facilitator failure: %v", err)
	}

	// Wait for recovery
	time.Sleep(5 * time.Second)

	// System should recover after healing
	err = makePaymentRequest(client, baseURL)
	assert.NoError(t, err, "System should recover after facilitator healing")
}

func testNetworkPartitionResilience(t *testing.T, baseURL string) {
	client := &http.Client{Timeout: 5 * time.Second}

	// Test network partition recovery
	err := injectNetworkPartition()
	if err != nil {
		t.Logf("Failed to inject network partition: %v", err)
		return
	}
	defer healNetworkPartition()

	// Wait for partition to take effect
	time.Sleep(2 * time.Second)

	// System should handle network partitions
	err = makePaymentRequest(client, baseURL)
	t.Logf("Payment during network partition: %v", err)

	// Wait before healing (defer will handle the cleanup)
	time.Sleep(2 * time.Second)

	// System should recover
	err = makePaymentRequest(client, baseURL)
	assert.NoError(t, err, "System should recover after network partition heals")
}

func testHighLoadBehavior(t *testing.T, baseURL string) {
	client := &http.Client{Timeout: 30 * time.Second}

	concurrency := 50
	requests := 100

	results := make(chan error, concurrency*requests)

	start := time.Now()

	for i := 0; i < concurrency; i++ {
		go func(workerID int) {
			for j := 0; j < requests; j++ {
				err := makePaymentRequest(client, baseURL)
				results <- err
			}
		}(i)
	}

	// Collect results
	successCount := 0
	failureCount := 0

	for i := 0; i < concurrency*requests; i++ {
		select {
		case err := <-results:
			if err == nil {
				successCount++
			} else {
				failureCount++
			}
		case <-time.After(60 * time.Second):
			t.Fatal("Load test timed out")
		}
	}

	duration := time.Since(start)
	rps := float64(successCount) / duration.Seconds()

	t.Logf("Load test results: %d successes, %d failures, %.2f RPS",
		successCount, failureCount, rps)

	// System should handle reasonable load
	successRate := float64(successCount) / float64(successCount + failureCount)
	assert.Greater(t, successRate, 0.7, "Success rate should be greater than 70% under load")
	assert.Greater(t, rps, 1.0, "Should handle at least 1 RPS")
}

func makePaymentRequest(client *http.Client, baseURL string) error {
	req, err := http.NewRequest(http.MethodPost, baseURL+"/v1/generate-payment",
		strings.NewReader(`{"amount": 0.01, "resource": "test", "description": "chaos test"}`))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	return nil
}

func injectDatabaseFailure() error {
	// Use Toxiproxy API to inject database failures
	client := &http.Client{Timeout: 5 * time.Second}

	// Create toxic for database connection
	req, err := http.NewRequest(http.MethodPost,
		"http://localhost:8474/proxies/postgres/toxics",
		strings.NewReader(`{
			"name": "db_down",
			"type": "down",
			"attributes": {}
		}`))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Failed to inject database failure: HTTP %d", resp.StatusCode)
	}

	return nil
}

func healDatabaseFailure() error {
	client := &http.Client{Timeout: 5 * time.Second}

	req, err := http.NewRequest(http.MethodDelete,
		"http://localhost:8474/proxies/postgres/toxics/db_down", nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

func injectNetworkPartition() error {
	client := &http.Client{Timeout: 5 * time.Second}

	req, err := http.NewRequest(http.MethodPost,
		"http://localhost:8474/proxies/facilitator/toxics",
		strings.NewReader(`{
			"name": "network_partition",
			"type": "timeout",
			"attributes": {"timeout": 0}
		}`))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

func healNetworkPartition() error {
	client := &http.Client{Timeout: 5 * time.Second}

	req, err := http.NewRequest(http.MethodDelete,
		"http://localhost:8474/proxies/facilitator/toxics/network_partition", nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

func injectFacilitatorFailure() error {
	client := &http.Client{Timeout: 5 * time.Second}

	// Create toxic for facilitator connection to simulate failures
	req, err := http.NewRequest(http.MethodPost,
		"http://localhost:8474/proxies/facilitator/toxics",
		strings.NewReader(`{
			"name": "facilitator_down",
			"type": "down",
			"attributes": {}
		}`))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Failed to inject facilitator failure: HTTP %d", resp.StatusCode)
	}

	return nil
}

func healFacilitatorFailure() error {
	client := &http.Client{Timeout: 5 * time.Second}

	req, err := http.NewRequest(http.MethodDelete,
		"http://localhost:8474/proxies/facilitator/toxics/facilitator_down", nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}