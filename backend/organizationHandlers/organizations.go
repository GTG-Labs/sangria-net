package organizationHandlers

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"

	"sangria/backend/auth"
	dbengine "sangria/backend/dbEngine"
	"sangria/backend/emailService"
)

// CreateOrganization handles POST /organizations
// Creates a new organization and makes the requesting user an admin
func CreateOrganization(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		var req struct {
			Name string `json:"name"`
		}
		if err := c.Bind().JSON(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
		}

		if req.Name == "" {
			return c.Status(400).JSON(fiber.Map{"error": "organization name is required"})
		}

		// Create the organization
		org, err := dbengine.CreateOrganization(c.Context(), pool, req.Name, user.ID)
		if err != nil {
			slog.Error("create organization", "user_id", user.ID, "name", req.Name, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to create organization"})
		}

		return c.Status(201).JSON(org)
	}
}

// ListUserOrganizations handles GET /organizations
// Returns all organizations the user is a member of
func ListUserOrganizations(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		memberships, err := dbengine.GetUserOrganizations(c.Context(), pool, user.ID)
		if err != nil {
			slog.Error("get user organizations", "user_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to get organizations"})
		}

		// Get organization details for each membership
		orgs, err := dbengine.GetOrganizationsByMemberships(c.Context(), pool, memberships)
		if err != nil {
			slog.Error("get organization details", "user_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to get organization details"})
		}

		return c.JSON(orgs)
	}
}

// InviteMember handles POST /organizations/:id/invitations
// Sends an invitation to join an organization (admin-only)
func InviteMember(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		organizationID := c.Params("id")
		if organizationID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "organization ID is required"})
		}

		var req struct {
			Email   string  `json:"email"`
			Message *string `json:"message"`
		}
		if err := c.Bind().JSON(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
		}

		if req.Email == "" {
			return c.Status(400).JSON(fiber.Map{"error": "email is required"})
		}

		// Verify user is an admin of this organization
		isAdmin, err := dbengine.IsOrganizationAdmin(c.Context(), pool, user.ID, organizationID)
		if err != nil {
			slog.Error("check admin status", "user_id", user.ID, "org_id", organizationID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to verify admin status"})
		}
		if !isAdmin {
			return c.Status(403).JSON(fiber.Map{"error": "only organization admins can invite members"})
		}

		// Create invitation
		invitation, err := dbengine.CreateOrganizationInvitation(
			c.Context(), pool, organizationID, user.ID, req.Email, req.Message,
		)
		if err != nil {
			if err == dbengine.ErrDuplicateInvitation {
				return c.Status(400).JSON(fiber.Map{"error": "invitation already sent to this email"})
			}
			slog.Error("create invitation", "user_id", user.ID, "org_id", organizationID, "email", req.Email, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to create invitation"})
		}

		// Send invitation email
		err = sendInvitationEmail(c.Context(), pool, invitation, user, req.Message)
		if err != nil {
			slog.Error("failed to send invitation email",
				"invitation_id", invitation.ID,
				"invitee_email", req.Email,
				"error", err)
			// Don't fail the request if email fails, just log it
			// The invitation is still created and can be accepted manually
		} else {
			slog.Info("invitation email sent successfully",
				"invitation_id", invitation.ID,
				"invitee_email", req.Email)
		}

		// Return invitation details (without sensitive token)
		return c.Status(201).JSON(fiber.Map{
			"id":               invitation.ID,
			"organization_id":  invitation.OrganizationID,
			"invitee_email":    invitation.InviteeEmail,
			"status":           invitation.Status,
			"expires_at":       invitation.ExpiresAt,
			"created_at":       invitation.CreatedAt,
		})
	}
}

// AcceptInvitation handles POST /invitations/accept
// Accepts an invitation using the token from email
func AcceptInvitation(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		var req struct {
			Token string `json:"token"`
		}
		if err := c.Bind().JSON(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
		}

		if req.Token == "" {
			return c.Status(400).JSON(fiber.Map{"error": "invitation token is required"})
		}

		// Accept the invitation
		err := dbengine.AcceptInvitation(c.Context(), pool, req.Token, user.ID, user.Email)
		if err != nil {
			if err == dbengine.ErrInvalidToken {
				return c.Status(404).JSON(fiber.Map{"error": "invitation not found or expired"})
			}
			slog.Error("accept invitation", "user_id", user.ID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to accept invitation"})
		}

		return c.Status(200).JSON(fiber.Map{"message": "invitation accepted successfully"})
	}
}

// ListPendingInvitations handles GET /organizations/:id/invitations
// Lists pending invitations for an organization (admin-only)
func ListPendingInvitations(pool *pgxpool.Pool) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, ok := c.Locals("workos_user").(auth.WorkOSUser)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
		}

		organizationID := c.Params("id")
		if organizationID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "organization ID is required"})
		}

		// Verify user is an admin of this organization
		isAdmin, err := dbengine.IsOrganizationAdmin(c.Context(), pool, user.ID, organizationID)
		if err != nil {
			slog.Error("check admin status", "user_id", user.ID, "org_id", organizationID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to verify admin status"})
		}
		if !isAdmin {
			return c.Status(403).JSON(fiber.Map{"error": "only organization admins can view invitations"})
		}

		// Get pending invitations
		invitations, err := dbengine.ListPendingInvitationsForOrganization(c.Context(), pool, organizationID)
		if err != nil {
			slog.Error("list invitations", "org_id", organizationID, "error", err)
			return c.Status(500).JSON(fiber.Map{"error": "failed to get invitations"})
		}

		// Remove sensitive tokens from response
		var response []fiber.Map
		for _, inv := range invitations {
			response = append(response, fiber.Map{
				"id":             inv.ID,
				"invitee_email":  inv.InviteeEmail,
				"status":         inv.Status,
				"message":        inv.Message,
				"expires_at":     inv.ExpiresAt,
				"created_at":     inv.CreatedAt,
			})
		}

		return c.JSON(response)
	}
}

// sendInvitationEmail sends an invitation email to the invitee
func sendInvitationEmail(ctx context.Context, pool *pgxpool.Pool, invitation dbengine.OrganizationInvitation, inviter auth.WorkOSUser, customMessage *string) error {
	// Get organization details
	org, err := dbengine.GetOrganizationByID(ctx, pool, invitation.OrganizationID)
	if err != nil {
		return fmt.Errorf("failed to get organization details: %w", err)
	}

	// Determine inviter display name
	inviterName := inviter.Email
	if inviter.FirstName != "" && inviter.LastName != "" {
		inviterName = fmt.Sprintf("%s %s", inviter.FirstName, inviter.LastName)
	} else if inviter.FirstName != "" {
		inviterName = inviter.FirstName
	}

	// Build frontend accept URL
	baseURL := getEnvWithDefault("FRONTEND_URL", "http://localhost:3000")
	acceptURL := fmt.Sprintf("%s/accept-invitation?token=%s", baseURL, invitation.InvitationToken)

	// Format expiration date
	expiresAt := invitation.ExpiresAt.Format("Monday, January 2, 2006 at 3:04 PM MST")

	// Create email data
	emailData := emailService.InvitationEmailData{
		InviteeEmail:     invitation.InviteeEmail,
		InviterName:      inviterName,
		OrganizationName: org.Name,
		InvitationToken:  invitation.InvitationToken,
		ExpiresAt:        expiresAt,
		Message:          customMessage,
		AcceptURL:        acceptURL,
	}

	// Get email service
	emailSvc := getEmailService()

	// Send email
	return emailSvc.SendInvitationEmail(ctx, emailData)
}

// getEmailService returns the configured email service
func getEmailService() emailService.EmailService {
	// Use mock service in development or if credentials aren't configured
	if os.Getenv("EMAIL_MOCK") == "true" || os.Getenv("SMTP_USERNAME") == "" {
		return emailService.NewMockEmailService()
	}
	return emailService.NewEmailService()
}

// getEnvWithDefault returns environment variable or default value
func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}