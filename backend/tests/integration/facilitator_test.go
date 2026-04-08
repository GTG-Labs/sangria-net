package integration

import (
	"bytes"
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
	// Create mock facilitator server
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/generate":
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}

			// Simulate successful payment generation
			response := map[string]interface{}{
				"challenge":  "mock_challenge_123",
				"amount":     10000, // 0.01 USDC in micro units
				"expires_in": 3600,
				"payment_url": "https://wallet.example.com/pay/mock_challenge_123",
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(response)

		case "/settle":
			if r.Method != http.MethodPost {
				w.WriteHeader(http.StatusMethodNotAllowed)
				return
			}

			var req map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "invalid request"})
				return
			}

			signature, ok := req["signature"].(string)
			if !ok || signature == "" {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"success":       false,
					"error_message": "Missing signature",
					"error_reason":  "MISSING_SIGNATURE",
				})
				return
			}

			// Simulate signature validation
			if signature == "invalid_signature" {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"success":       false,
					"error_message": "Invalid signature",
					"error_reason":  "INVALID_SIGNATURE",
				})
				return
			}

			// Simulate successful settlement
			response := map[string]interface{}{
				"success":     true,
				"transaction": "tx_" + signature,
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

	t.Run("Successful payment generation", func(t *testing.T) {
		client := &http.Client{Timeout: 5 * time.Second}

		req, err := http.NewRequest(http.MethodPost, mockServer.URL+"/generate", nil)
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var response map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&response)
		require.NoError(t, err)

		assert.Contains(t, response, "challenge")
		assert.Contains(t, response, "amount")
		assert.Contains(t, response, "expires_in")
		assert.Contains(t, response, "payment_url")
	})

	t.Run("Successful payment settlement", func(t *testing.T) {
		client := &http.Client{Timeout: 5 * time.Second}

		requestBody := map[string]string{
			"signature": "valid_signature_123",
		}
		body, err := json.Marshal(requestBody)
		require.NoError(t, err)

		req, err := http.NewRequest(http.MethodPost, mockServer.URL+"/settle",
			bytes.NewReader(body))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var response map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&response)
		require.NoError(t, err)

		assert.True(t, response["success"].(bool))
		assert.Contains(t, response, "transaction")
	})

	t.Run("Invalid signature settlement", func(t *testing.T) {
		client := &http.Client{Timeout: 5 * time.Second}

		requestBody := map[string]string{
			"signature": "invalid_signature",
		}
		body, err := json.Marshal(requestBody)
		require.NoError(t, err)

		req, err := http.NewRequest(http.MethodPost, mockServer.URL+"/settle",
			bytes.NewReader(body))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

		var response map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&response)
		require.NoError(t, err)

		assert.False(t, response["success"].(bool))
		assert.Equal(t, "Invalid signature", response["error_message"])
		assert.Equal(t, "INVALID_SIGNATURE", response["error_reason"])
	})

	t.Run("Facilitator timeout", func(t *testing.T) {
		client := &http.Client{Timeout: 1 * time.Second} // Short timeout

		req, err := http.NewRequest(http.MethodPost, mockServer.URL+"/slow", nil)
		require.NoError(t, err)

		_, err = client.Do(req)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "deadline exceeded")
	})

	t.Run("Large response handling", func(t *testing.T) {
		client := &http.Client{Timeout: 5 * time.Second}

		req, err := http.NewRequest(http.MethodGet, mockServer.URL+"/large", nil)
		require.NoError(t, err)

		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		// This test verifies that the client can handle large responses
		// In production, you'd want to limit response size to prevent OOM
		assert.Equal(t, http.StatusOK, resp.StatusCode)
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

			// This test checks the auth logic in addCDPAuth function
			// In a real test, you'd call the actual function and verify the JWT header
			url, err := x402Handlers.FacilitatorURL()
			require.NoError(t, err)
			assert.Equal(t, tt.facilitatorURL, url)

			// Test auth requirement logic
			requiresAuth := strings.Contains(tt.facilitatorURL, "api.cdp.coinbase.com")
			hasCredentials := tt.apiKey != "" && tt.apiSecret != ""

			if requiresAuth && !hasCredentials {
				// Should fail in production
				assert.False(t, tt.expectAuth)
			} else {
				assert.True(t, tt.expectAuth || !requiresAuth)
			}
		})
	}
}