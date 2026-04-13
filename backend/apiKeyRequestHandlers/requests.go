package apiKeyRequestHandlers

import (
	"log/slog"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"

	"sangria/backend/auth"
	dbengine "sangria/backend/dbEngine"
)

// RequestAPIKey handles POST /api-key-requests
// Creates a new API key creation request (non-admin users)
func RequestAPIKey(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		var req struct {
			OrganizationID string  `json:"organization_id"`
			KeyName        string  `json:"key_name"`
			Justification  *string `json:"justification"`
		}
		if err := c.Bind().JSON(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
		}

		if req.OrganizationID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "organization_id is required"})
		}
		if req.KeyName == "" {
			return c.Status(400).JSON(fiber.Map{"error": "key_name is required"})
		}

		// Verify user is a member of this organization
		isOrganizationMember, err := dbengine.IsOrganizationMember(c.Context(), pool, user.ID, req.OrganizationID)
		if err != nil {
			slog.Error("check organization membership", "user_id", user.ID, "org_id", req.OrganizationID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to verify organization membership"})
		}
		if !isOrganizationMember {
			return c.Status(403).JSON(fiber.Map{"error": "user is not a member of this organization"})
		}

		justification := ""
		if req.Justification != nil {
			justification = *req.Justification
		}

		// Create API key creation request
		request, err := dbengine.CreateAPIKeyCreationRequest(
			c.Context(), pool, user.ID, req.OrganizationID, req.KeyName, justification,
		)
		if err != nil {
			if err == dbengine.ErrDuplicateRequest {
				return c.Status(400).JSON(fiber.Map{"error": "you already have a pending request for this organization"})
			}
			slog.Error("create API key request", "user_id", user.ID, "org_id", req.OrganizationID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to create API key request"})
		}

		return c.Status(201).JSON(request)
	}
}

// ListAPIKeyRequests handles GET /api-key-requests
// Lists API key requests for the user or organization (depending on admin status)
func ListAPIKeyRequests(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		organizationID := c.Query("organization_id")
		if organizationID != "" {
			// Admin view: get all requests for the organization
			isAdmin, err := dbengine.IsOrganizationAdmin(c.Context(), pool, user.ID, organizationID)
			if err != nil {
				slog.Error("check admin status", "user_id", user.ID, "org_id", organizationID, "error", err)
				return c.Status(500).JSON(fiber.Map{"error": "failed to verify admin status"})
			}
			if !isAdmin {
				return c.Status(403).JSON(fiber.Map{"error": "only organization admins can view all requests"})
			}

			requests, err := dbengine.ListAPIKeyCreationRequestsForOrganization(c.Context(), pool, organizationID)
			if err != nil {
				slog.Error("list org requests", "org_id", organizationID, "error", err)
				return c.Status(500).JSON(fiber.Map{"error": "failed to get requests"})
			}

			return c.JSON(requests)
		} else {
			// User view: get their own requests across all organizations
			requests, err := dbengine.ListAPIKeyCreationRequestsForUser(c.Context(), pool, user.ID)
			if err != nil {
				slog.Error("list user requests", "user_id", user.ID, "error", err)
				return c.Status(500).JSON(fiber.Map{"error": "failed to get requests"})
			}

			return c.JSON(requests)
		}
	}
}

// ApproveAPIKeyRequest handles POST /api-key-requests/:id/approve
// Approves an API key request and creates the actual key (admin-only)
func ApproveAPIKeyRequest(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		requestID := c.Params("id")
		if requestID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "request ID is required"})
		}

		var req struct {
			ReviewNote *string `json:"review_note"`
		}
		if err := c.Bind().JSON(&req); err != nil {
			// Allow empty body
			req.ReviewNote = nil
		}

		// Approve the request and create the API key
		merchant, fullKey, err := dbengine.ApproveAPIKeyCreationRequest(
			c.Context(), pool, requestID, user.ID, req.ReviewNote, auth.CreateAPIKey,
		)
		if err != nil {
			if err == dbengine.ErrRequestNotFound {
				return c.Status(404).JSON(fiber.Map{"error": "request not found"})
			}
			if err == dbengine.ErrInvalidRequestStatus {
				return c.Status(400).JSON(fiber.Map{"error": "request cannot be approved (already processed)"})
			}
			slog.Error("approve API key request", "request_id", requestID, "admin_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to approve request"})
		}

		// Return the created API key (only shown once)
		return c.Status(200).JSON(fiber.Map{
			"message":         "API key request approved and key created",
			"merchant_id":     merchant.ID,
			"organization_id": merchant.OrganizationID,
			"name":            merchant.Name,
			"key_id":          merchant.KeyID,
			"api_key":         fullKey, // Only shown once
			"is_active":       merchant.IsActive,
			"created_at":      merchant.CreatedAt,
		})
	}
}

// RejectAPIKeyRequest handles POST /api-key-requests/:id/reject
// Rejects an API key request (admin-only)
func RejectAPIKeyRequest(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		requestID := c.Params("id")
		if requestID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "request ID is required"})
		}

		var req struct {
			ReviewNote *string `json:"review_note"`
		}
		if err := c.Bind().JSON(&req); err != nil {
			// Allow empty body
			req.ReviewNote = nil
		}

		// Reject the request
		err := dbengine.RejectAPIKeyCreationRequest(c.Context(), pool, requestID, user.ID, req.ReviewNote)
		if err != nil {
			if err == dbengine.ErrRequestNotFound {
				return c.Status(404).JSON(fiber.Map{"error": "request not found"})
			}
			if err == dbengine.ErrInvalidRequestStatus {
				return c.Status(400).JSON(fiber.Map{"error": "request cannot be rejected (already processed)"})
			}
			slog.Error("reject API key request", "request_id", requestID, "admin_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to reject request"})
		}

		return c.Status(200).JSON(fiber.Map{"message": "API key request rejected"})
	}
}