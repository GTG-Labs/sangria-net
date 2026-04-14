package adminHandlers

import (
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"sangria/backend/auth"
	dbengine "sangria/backend/dbEngine"
)

// validateAPIKeyAdminPermissions validates that the user is an admin of the organization that owns the API key
func validateAPIKeyAdminPermissions(c fiber.Ctx, pool *pgxpool.Pool, user auth.WorkOSUser, keyID string) (string, error) {
	// Validate keyID format - must be a valid UUID
	if _, err := uuid.Parse(keyID); err != nil {
		return "", fiber.NewError(400, "invalid API key ID format")
	}

	// Check if user is admin of any organization
	memberships, err := dbengine.GetUserOrganizations(c.Context(), pool, user.ID)
	if err != nil {
		slog.Error("get user organizations", "user_id", user.ID, "error", err)
		return "", fiber.NewError(500, "failed to get user organizations")
	}

	isAdmin := false
	for _, membership := range memberships {
		if membership.IsAdmin {
			isAdmin = true
			break
		}
	}

	if !isAdmin {
		return "", fiber.NewError(403, "admin access required")
	}

	// Get the merchant's organization ID to verify admin scope
	var merchantOrgID string
	err = pool.QueryRow(c.Context(),
		`SELECT organization_id FROM merchants WHERE id = $1 AND status = 'pending'`,
		keyID,
	).Scan(&merchantOrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", fiber.NewError(404, "pending API key not found")
		}
		slog.Error("get merchant organization", "key_id", keyID, "user_id", user.ID, "error", err)
		return "", fiber.NewError(500, "failed to verify API key")
	}

	// Verify user is admin of the specific organization that owns this key
	isOrgAdmin := false
	for _, membership := range memberships {
		if membership.OrganizationID == merchantOrgID && membership.IsAdmin {
			isOrgAdmin = true
			break
		}
	}
	if !isOrgAdmin {
		return "", fiber.NewError(403, "admin access required for this organization")
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

		// Validate admin permissions and get organization ID
		merchantOrgID, err := validateAPIKeyAdminPermissions(c, pool, user, keyID)
		if err != nil {
			if fiberErr, ok := err.(*fiber.Error); ok {
				return c.Status(fiberErr.Code).JSON(fiber.Map{"error": fiberErr.Message})
			}
			return err
		}

		// Update the API key status to active
		result, err := pool.Exec(c.Context(),
			`UPDATE merchants SET status = 'active' WHERE id = $1 AND status = 'pending' AND organization_id = $2`,
			keyID, merchantOrgID,
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

		// Validate admin permissions and get organization ID
		merchantOrgID, err := validateAPIKeyAdminPermissions(c, pool, user, keyID)
		if err != nil {
			if fiberErr, ok := err.(*fiber.Error); ok {
				return c.Status(fiberErr.Code).JSON(fiber.Map{"error": fiberErr.Message})
			}
			return err
		}

		// Update the API key status to inactive
		result, err := pool.Exec(c.Context(),
			`UPDATE merchants SET status = 'inactive' WHERE id = $1 AND status = 'pending' AND organization_id = $2`,
			keyID, merchantOrgID,
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