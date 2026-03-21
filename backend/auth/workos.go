package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
	"github.com/workos/workos-go/v4/pkg/usermanagement"
)

// Global JWKS cache, URL, and issuer for WorkOS JWT validation
var jwksCache *jwk.Cache
var jwksURL string
var expectedIssuer string

// InitJWKSCache initializes the global JWKS cache with proper security settings.
func InitJWKSCache(clientID string) error {
	// Validate issuer first — fail fast if not configured.
	expectedIssuer = os.Getenv("WORKOS_TOKEN_ISSUER")
	if expectedIssuer == "" {
		return fmt.Errorf("WORKOS_TOKEN_ISSUER environment variable is required")
	}

	// Get JWKS URL for this client and store it for reuse
	parsedURL, err := usermanagement.GetJWKSURL(clientID)
	if err != nil {
		return fmt.Errorf("failed to get JWKS URL: %w", err)
	}
	jwksURL = parsedURL.String()

	// Create HTTP client with timeout to avoid indefinite hangs
	httpClient := &http.Client{
		Timeout: 10 * time.Second,
	}

	// Initialize JWKS cache with security restrictions
	jwksCache = jwk.NewCache(context.Background())

	// Register the JWKS URL with the cache, using custom HTTP client and fetch whitelist
	err = jwksCache.Register(jwksURL,
		jwk.WithHTTPClient(httpClient),
		jwk.WithFetchWhitelist(jwk.WhitelistFunc(func(u string) bool {
			return u == jwksURL
		})))
	if err != nil {
		return fmt.Errorf("failed to register JWKS URL: %w", err)
	}

	// Fetch and validate the JWKS immediately so we fail fast at startup
	// if the endpoint is unreachable or returns invalid keys.
	if _, err := jwksCache.Refresh(context.Background(), jwksURL); err != nil {
		return fmt.Errorf("failed to fetch JWKS on startup: %w", err)
	}

	return nil
}

// VerifyWorkOSToken validates a WorkOS JWT token and extracts the user ID.
func VerifyWorkOSToken(ctx context.Context, tokenStr string) (string, error) {
	if jwksCache == nil {
		return "", fmt.Errorf("jwks cache not initialized — call InitJWKSCache first")
	}

	// Get key set from cache (this will automatically fetch/refresh as needed)
	keySet, err := jwksCache.Get(ctx, jwksURL)
	if err != nil {
		return "", fmt.Errorf("failed to get JWKS from cache: %w", err)
	}

	// Step 1: Parse and verify signature only (no claim validation yet).
	token, err := jwt.ParseString(tokenStr, jwt.WithKeySet(keySet), jwt.WithValidate(false))
	if err != nil {
		return "", fmt.Errorf("failed to parse/verify token signature: %w", err)
	}

	// Step 2: Validate claims separately for clearer error messages.
	// WithAcceptableSkew: WorkOS may issue tokens with an `iat` a few seconds
	// ahead of this server's clock, causing "iat not satisfied" rejections.
	if err := jwt.Validate(token,
		jwt.WithAcceptableSkew(5*time.Second),
		jwt.WithIssuer(expectedIssuer),
	); err != nil {
		if errors.Is(err, jwt.ErrTokenExpired()) {
			return "", fmt.Errorf("token expired, please refresh your session")
		}
		return "", fmt.Errorf("token claim validation failed: %w", err)
	}

	// Extract user ID from 'sub' claim
	userID, ok := token.Get("sub")
	if !ok {
		return "", fmt.Errorf("token missing 'sub' claim")
	}

	userIDStr, ok := userID.(string)
	if !ok {
		return "", fmt.Errorf("invalid 'sub' claim type")
	}

	return userIDStr, nil
}
