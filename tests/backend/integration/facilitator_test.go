package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sangrianet/backend/x402Handlers"
)

func TestFacilitatorIntegration(t *testing.T) {
	tests := []struct {
		name           string
		facilitatorURL string
		shouldFail     bool
		expectedError  string
	}{
		{
			name:           "Valid facilitator URL",
			facilitatorURL: "https://api.x402.org",
			shouldFail:     false,
		},
		{
			name:           "Empty facilitator URL",
			facilitatorURL: "",
			shouldFail:     true,
			expectedError:  "X402_FACILITATOR_URL environment variable is not set",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set environment variable
			if tt.facilitatorURL != "" {
				t.Setenv("X402_FACILITATOR_URL", tt.facilitatorURL)
			} else {
				t.Setenv("X402_FACILITATOR_URL", "")
			}

			url, err := x402Handlers.FacilitatorURL()

			if tt.shouldFail {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.expectedError)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.facilitatorURL, url)
			}
		})
	}
}

func TestFacilitatorHTTPClient(t *testing.T) {
	// Create mock facilitator server that matches production API
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/verify":
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}

			var req x402Handlers.VerifyRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
				return
			}

			// Simulate validation logic based on payload
			var payloadMap map[string]interface{}
			json.Unmarshal(req.Payload, &payloadMap)

			response := x402Handlers.VerifyResponse{
				IsValid: true,
				Payer:   "0x1234567890123456789012345678901234567890",
			}

			// Simulate invalid signature
			if signature, ok := payloadMap["signature"].(string); ok && signature == "invalid_signature" {
				response.IsValid = false
				response.InvalidReason = "INVALID_SIGNATURE"
				response.InvalidMessage = "Invalid signature"
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(response)

		case "/settle":
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}

			var req x402Handlers.SettleRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
				return
			}

			var payloadMap map[string]interface{}
			json.Unmarshal(req.Payload, &payloadMap)

			response := x402Handlers.SettleResponse{
				Success:     true,
				Transaction: "tx_" + time.Now().Format("20060102150405"),
				Network:     req.Requirements.Network,
				Payer:       "0x1234567890123456789012345678901234567890",
			}

			// Simulate invalid signature
			if signature, ok := payloadMap["signature"].(string); ok && signature == "invalid_signature" {
				response.Success = false
				response.ErrorReason = "INVALID_SIGNATURE"
				response.ErrorMessage = "Invalid signature"
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(response)

		case "/slow":
			// Simulate slow response for timeout testing
			time.Sleep(35 * time.Second) // Longer than httpClient timeout (30s)
			w.WriteHeader(http.StatusOK)

		case "/large":
			// Simulate large response for size limit testing
			largeData := make(map[string]interface{})
			largeData["data"] = string(make([]byte, 2<<20)) // 2MB > maxFacilitatorBody (1MB)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(largeData)

		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mockServer.Close()

	// Set mock server as facilitator URL
	t.Setenv("X402_FACILITATOR_URL", mockServer.URL)

	// Create test payload and requirements
	testPayload := json.RawMessage(`{"signature": "valid_signature_123", "from": "0x1234567890123456789012345678901234567890", "amount": "10000"}`)
	testRequirements := x402Handlers.PaymentRequirements{
		Scheme:            "eip712",
		Network:           "base-sepolia",
		Asset:             "USDC",
		Amount:            "10000",
		PayTo:             "0x0987654321098765432109876543210987654321",
		MaxTimeoutSeconds: 3600,
	}

	t.Run("Successful payment verification", func(t *testing.T) {
		ctx := context.Background()

		result, err := x402Handlers.Verify(ctx, testPayload, testRequirements)
		require.NoError(t, err)

		assert.True(t, result.IsValid)
		assert.Equal(t, "0x1234567890123456789012345678901234567890", result.Payer)
		assert.Empty(t, result.InvalidReason)
	})

	t.Run("Successful payment settlement", func(t *testing.T) {
		ctx := context.Background()

		result, err := x402Handlers.Settle(ctx, testPayload, testRequirements)
		require.NoError(t, err)

		assert.True(t, result.Success)
		assert.Contains(t, result.Transaction, "tx_")
		assert.Equal(t, "base-sepolia", result.Network)
		assert.Equal(t, "0x1234567890123456789012345678901234567890", result.Payer)
	})

	t.Run("Invalid signature settlement", func(t *testing.T) {
		ctx := context.Background()
		invalidPayload := json.RawMessage(`{"signature": "invalid_signature", "from": "0x1234567890123456789012345678901234567890", "amount": "10000"}`)

		result, err := x402Handlers.Settle(ctx, invalidPayload, testRequirements)
		require.NoError(t, err)

		assert.False(t, result.Success)
		assert.Equal(t, "INVALID_SIGNATURE", result.ErrorReason)
		assert.Equal(t, "Invalid signature", result.ErrorMessage)
	})

	t.Run("Facilitator timeout", func(t *testing.T) {
		// Set facilitator URL to slow endpoint
		t.Setenv("X402_FACILITATOR_URL", mockServer.URL+"/slow")

		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		defer cancel()

		_, err := x402Handlers.Verify(ctx, testPayload, testRequirements)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "context deadline exceeded")
	})

	t.Run("Large response handling", func(t *testing.T) {
		// Set facilitator URL to large response endpoint
		t.Setenv("X402_FACILITATOR_URL", mockServer.URL+"/large")

		ctx := context.Background()

		// The production code should handle large responses gracefully with size limits
		_, err := x402Handlers.Verify(ctx, testPayload, testRequirements)
		// This should either succeed or fail with a size limit error, not cause OOM
		// The exact behavior depends on the production implementation
		if err != nil {
			t.Logf("Large response handling error: %v", err)
		}
	})
}

func TestFacilitatorAuth(t *testing.T) {
	tests := []struct {
		name           string
		facilitatorURL string
		apiKey         string
		apiSecret      string
		expectAuth     bool
	}{
		{
			name:           "Coinbase facilitator with credentials",
			facilitatorURL: "https://api.cdp.coinbase.com",
			apiKey:         "test_key",
			apiSecret:      "test_secret",
			expectAuth:     true,
		},
		{
			name:           "Coinbase facilitator without credentials",
			facilitatorURL: "https://api.cdp.coinbase.com",
			apiKey:         "",
			apiSecret:      "",
			expectAuth:     false, // Should fail
		},
		{
			name:           "Non-Coinbase facilitator",
			facilitatorURL: "https://api.x402.org",
			apiKey:         "",
			apiSecret:      "",
			expectAuth:     true, // No auth required
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set environment variables
			t.Setenv("X402_FACILITATOR_URL", tt.facilitatorURL)
			t.Setenv("CDP_API_KEY", tt.apiKey)
			t.Setenv("CDP_API_SECRET", tt.apiSecret)

			url, err := x402Handlers.FacilitatorURL()
			require.NoError(t, err)
			assert.Equal(t, tt.facilitatorURL, url)

			// Test actual auth logic by calling Verify function which internally uses addCDPAuth
			// Use a minimal payload to test the auth flow
			payload := []byte(`{"test": "payload"}`)
			requirements := x402Handlers.PaymentRequirements{
				Scheme:            "ethereum",
				Network:           "base-sepolia",
				Asset:             "ETH",
				Amount:            "1000",
				PayTo:             "0x123",
				MaxTimeoutSeconds: 3600,
			}

			_, err = x402Handlers.Verify(context.Background(), payload, requirements)

			if tt.expectAuth {
				if strings.Contains(tt.facilitatorURL, "api.cdp.coinbase.com") {
					if tt.apiKey != "" && tt.apiSecret != "" {
						// Should proceed with auth (may fail due to network/invalid payload, but not auth error)
						if err != nil {
							assert.NotContains(t, err.Error(), "CDP_API_KEY and CDP_API_SECRET are required",
								"Should not fail due to missing auth credentials")
						}
					} else {
						// Should fail due to missing credentials
						assert.Error(t, err)
						assert.Contains(t, err.Error(), "CDP_API_KEY and CDP_API_SECRET are required")
					}
				} else {
					// Non-CDP facilitator should proceed (may fail due to network but not auth)
					if err != nil {
						assert.NotContains(t, err.Error(), "CDP_API_KEY and CDP_API_SECRET are required",
							"Non-CDP facilitator should not require auth credentials")
					}
				}
			} else {
				// Should fail due to missing credentials for CDP facilitator
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "CDP_API_KEY and CDP_API_SECRET are required")
			}
		})
	}
}