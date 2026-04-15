package adminHandlers

import (
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sangria/backend/auth"
)

// validateAPIKeyAdminPermissions validates that the user is an admin of the organization that owns the API key
func validateAPIKeyAdminPermissions(c fiber.Ctx, pool *pgxpool.Pool, user auth.WorkOSUser, keyID string) (string, error) {
	// Validate keyID format - must be a valid UUID
	if _, err := uuid.Parse(keyID); err != nil {
		return "", fiber.NewError(400, "invalid API key ID format")
	}

	// Get the organization ID for this API key and check if user is admin in one query
	var merchantOrgID string
	err := pool.QueryRow(c.Context(), `
		SELECT m.organization_id
		FROM merchants m
		JOIN organization_members om ON m.organization_id = om.organization_id
		WHERE m.id = $1 AND m.status = 'pending'
		AND om.user_id = $2 AND om.is_admin = true
	`, keyID, user.ID).Scan(&merchantOrgID)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", fiber.NewError(404, "API key not found or insufficient permissions")
		}
		slog.Error("validate API key admin permissions", "key_id", keyID, "user_id", user.ID, "error", err)
		return "", fiber.NewError(500, "failed to verify permissions")
	}

	return merchantOrgID, nil
}

// ApproveAPIKey handles POST /api-keys/:id/approve.
// Changes a pending API key to active status (admin-only).
func ApproveAPIKey(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		// Get authenticated user from middleware context
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		keyID := c.Params("id")
		if keyID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "API key ID is required"})
		}

		// Update the API key status to active with atomic permission check
		// The UPDATE only succeeds if the user is still an org admin at execution time
		result, err := pool.Exec(c.Context(),
			`UPDATE merchants SET status = 'active'
			 FROM organization_members om
			 WHERE merchants.id = $1
			   AND merchants.status = 'pending'
			   AND merchants.organization_id = om.organization_id
			   AND om.user_id = $2
			   AND om.is_admin = true`,
			keyID, user.ID,
		)
		if err != nil {
			slog.Error("approve API key", "key_id", keyID, "user_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to approve API key"})
		}

		if result.RowsAffected() == 0 {
			return c.Status(404).JSON(fiber.Map{"error": "pending API key not found"})
		}

		return c.JSON(fiber.Map{
			"message": "API key approved and activated",
		})
	}
}

// RejectAPIKey handles POST /api-keys/:id/reject.
// Changes a pending API key to inactive status (admin-only).
func RejectAPIKey(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		// Get authenticated user from middleware context
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		keyID := c.Params("id")
		if keyID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "API key ID is required"})
		}

		// Update the API key status to inactive with atomic permission check
		// The UPDATE only succeeds if the user is still an org admin at execution time
		result, err := pool.Exec(c.Context(),
			`UPDATE merchants SET status = 'inactive'
			 FROM organization_members om
			 WHERE merchants.id = $1
			   AND merchants.status = 'pending'
			   AND merchants.organization_id = om.organization_id
			   AND om.user_id = $2
			   AND om.is_admin = true`,
			keyID, user.ID,
		)
		if err != nil {
			slog.Error("reject API key", "key_id", keyID, "user_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to reject API key"})
		}

		if result.RowsAffected() == 0 {
			return c.Status(404).JSON(fiber.Map{"error": "pending API key not found"})
		}

		return c.JSON(fiber.Map{
			"message": "API key rejected and deactivated",
		})
	}
}