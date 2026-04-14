package dbengine

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrUserNotFound is returned when a user does not exist.
var ErrUserNotFound = errors.New("user not found")

// ---------------------------------------------------------------------------
// Organization Invitations - Database Functions
// ---------------------------------------------------------------------------

// CreateInvitation creates a new organization invitation with a secure token
func CreateInvitation(ctx context.Context, pool *pgxpool.Pool, orgID, inviterUserID, inviteeEmail, message, token string) (string, error) {
	var invitationID string
	err := pool.QueryRow(ctx, `
		INSERT INTO organization_invitations
		(organization_id, inviter_user_id, invitee_email, message, invitation_token, expires_at)
		VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
		RETURNING id`,
		orgID, inviterUserID, inviteeEmail, message, token,
	).Scan(&invitationID)

	if err != nil {
		return "", fmt.Errorf("failed to create invitation: %w", err)
	}
	return invitationID, nil
}

// GetInvitationByToken retrieves an invitation by its token
func GetInvitationByToken(ctx context.Context, pool *pgxpool.Pool, token string) (*OrganizationInvitation, error) {
	var invitation OrganizationInvitation
	err := pool.QueryRow(ctx, `
		SELECT id, organization_id, inviter_user_id, invitee_email, invitee_user_id,
		       status, message, invitation_token, expires_at, created_at, accepted_at
		FROM organization_invitations
		WHERE invitation_token = $1`,
		token,
	).Scan(
		&invitation.ID, &invitation.OrganizationID, &invitation.InviterUserID,
		&invitation.InviteeEmail, &invitation.InviteeUserID, &invitation.Status,
		&invitation.Message, &invitation.InvitationToken, &invitation.ExpiresAt,
		&invitation.CreatedAt, &invitation.AcceptedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("invitation not found")
		}
		return nil, fmt.Errorf("failed to get invitation: %w", err)
	}
	return &invitation, nil
}

// MarkInvitationAccepted marks an invitation as accepted without creating a user
func MarkInvitationAccepted(ctx context.Context, pool *pgxpool.Pool, token string) error {
	_, err := pool.Exec(ctx, `
		UPDATE organization_invitations
		SET status = 'accepted', accepted_at = NOW()
		WHERE invitation_token = $1 AND status = 'pending'`,
		token,
	)

	if err != nil {
		return fmt.Errorf("failed to mark invitation as accepted: %w", err)
	}

	return nil
}

// ProcessAcceptedInvitations checks for accepted invitations for this user and adds them to organizations
func ProcessAcceptedInvitations(ctx context.Context, pool *pgxpool.Pool, userID, userEmail string) error {
	// Find all accepted invitations for this email that haven't been processed
	rows, err := pool.Query(ctx, `
		SELECT organization_id, id
		FROM organization_invitations
		WHERE invitee_email = $1 AND status = 'accepted' AND invitee_user_id IS NULL`,
		userEmail,
	)
	if err != nil {
		return fmt.Errorf("failed to query accepted invitations: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var orgID, invitationID string
		if err := rows.Scan(&orgID, &invitationID); err != nil {
			return fmt.Errorf("failed to scan invitation: %w", err)
		}

		// Add user to organization
		err = AddUserToOrganization(ctx, pool, userID, orgID, false)
		if err != nil {
			return fmt.Errorf("failed to add user to organization %s: %w", orgID, err)
		}

		// Mark invitation as fully processed
		_, err = pool.Exec(ctx, `
			UPDATE organization_invitations
			SET invitee_user_id = $1
			WHERE id = $2`,
			userID, invitationID,
		)
		if err != nil {
			return fmt.Errorf("failed to update invitation %s: %w", invitationID, err)
		}

		slog.Info("Processed accepted invitation",
			"user_id", userID,
			"organization_id", orgID,
			"invitation_id", invitationID,
		)
	}

	return nil
}




// ---------------------------------------------------------------------------
// Organization Member Management Functions
// ---------------------------------------------------------------------------

// ListOrganizationMembers returns all members of an organization.
func ListOrganizationMembers(ctx context.Context, pool *pgxpool.Pool, organizationID string) ([]OrganizationMember, error) {
	rows, err := pool.Query(ctx, `
		SELECT om.user_id, om.organization_id, om.is_admin, om.joined_at, u.owner
		FROM organization_members om
		JOIN users u ON u.workos_id = om.user_id
		WHERE om.organization_id = $1
		ORDER BY om.joined_at DESC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query organization members: %w", err)
	}
	defer rows.Close()

	var members []OrganizationMember
	for rows.Next() {
		var member OrganizationMember
		if err := rows.Scan(
			&member.UserID, &member.OrganizationID, &member.IsAdmin, &member.JoinedAt, &member.UserEmail,
		); err != nil {
			return nil, fmt.Errorf("failed to scan organization member: %w", err)
		}
		members = append(members, member)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("querying organization members: %w", err)
	}
	return members, nil
}

// RemoveUserFromOrganization removes a user from an organization.
func RemoveUserFromOrganization(ctx context.Context, pool *pgxpool.Pool, userID, organizationID string) error {
	result, err := pool.Exec(ctx,
		`DELETE FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
		userID, organizationID,
	)
	if err != nil {
		return fmt.Errorf("failed to remove user from organization: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("user not found in organization")
	}
	return nil
}

// AddUserToOrganizationTx adds a user to an organization within an existing transaction.
func AddUserToOrganizationTx(ctx context.Context, tx pgx.Tx, userID, organizationID string, isAdmin bool) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO organization_members (user_id, organization_id, is_admin, joined_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (user_id, organization_id) DO UPDATE
			SET is_admin = organization_members.is_admin OR EXCLUDED.is_admin`,
		userID, organizationID, isAdmin,
	)
	return err
}