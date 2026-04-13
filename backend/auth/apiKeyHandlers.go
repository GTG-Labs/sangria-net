package auth

import (
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"

	dbengine "sangria/backend/dbEngine"
)

// ListAPIKeys handles GET /api-keys
func ListAPIKeys(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		// Get user's organizations to determine organization context
		memberships, err := dbengine.GetUserOrganizations(c.Context(), pool, user.ID)
		if err != nil {
			slog.Error("get user organizations", "user_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to get user organizations"})
		}
		if len(memberships) == 0 {
			slog.Error("user has no organizations", "user_id", user.ID)
			return c.Status(400).JSON(fiber.Map{"error": "user must belong to an organization"})
		}

		// Derive selectedOrgID from request or user's active selection
		var selectedOrgID string

		// Check for organization_id in request query params
		if orgID := c.Query("org_id"); orgID != "" {
			// Validate that user is a member of this organization
			found := false
			for _, membership := range memberships {
				if membership.OrganizationID == orgID {
					selectedOrgID = orgID
					found = true
					break
				}
			}
			if !found {
				return c.Status(400).JSON(fiber.Map{"error": "user is not a member of the specified organization"})
			}
		} else if orgID := c.Query("organization_id"); orgID != "" {
			// Also check for organization_id parameter
			found := false
			for _, membership := range memberships {
				if membership.OrganizationID == orgID {
					selectedOrgID = orgID
					found = true
					break
				}
			}
			if !found {
				return c.Status(400).JSON(fiber.Map{"error": "user is not a member of the specified organization"})
			}
		} else if len(memberships) == 1 {
			// If only one membership exists, use that
			selectedOrgID = memberships[0].OrganizationID
		} else {
			// Multiple memberships exist, prompt for specification
			return c.Status(400).JSON(fiber.Map{"error": "multiple organizations found, please specify org_id or organization_id parameter"})
		}

		// Get API keys for the selected organization
		apiKeys, err := GetAPIKeysByOrganizationID(c.Context(), pool, selectedOrgID)
		if err != nil {
			slog.Error("get API keys by organization", "org_id", selectedOrgID, "user_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to retrieve API keys"})
		}

		// Note: apiKeys already excludes sensitive APIKey hash (using MerchantPublic struct)

		return c.JSON(apiKeys)
	}
}

// DeleteAPIKey handles DELETE /api-keys/:id (admin-only)
func DeleteAPIKey(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}
		keyID := c.Params("id")

		if keyID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "API key ID is required"})
		}

		// Admin-only deletion flow - RevokeAPIKey already validates admin permissions
		err := RevokeAPIKey(c.Context(), pool, keyID, user.ID)
		if err != nil {
			if errors.Is(err, ErrAPIKeyNotFound) {
				return c.Status(404).JSON(fiber.Map{"error": "API key not found or not owned by user"})
			}
			slog.Error("revoke API key: failed", "key_id", keyID, "user_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to revoke API key"})
		}

		return c.Status(204).Send(nil)
	}
}