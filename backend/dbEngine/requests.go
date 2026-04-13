package dbengine

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrRequestNotFound is returned when a request does not exist.
var ErrRequestNotFound = errors.New("request not found")

// ErrInvalidRequestStatus is returned when trying to perform an invalid status transition.
var ErrInvalidRequestStatus = errors.New("invalid request status transition")

// ErrInvitationNotFound is returned when an invitation does not exist.
var ErrInvitationNotFound = errors.New("invitation not found")

// ErrDuplicateInvitation is returned when a duplicate pending invitation exists.
var ErrDuplicateInvitation = errors.New("duplicate pending invitation exists")

// ErrDuplicateRequest is returned when a user already has a pending API key request for an organization.
var ErrDuplicateRequest = errors.New("duplicate pending API key request exists")

// ErrInvalidToken is returned when an invitation token is invalid or expired.
var ErrInvalidToken = errors.New("invalid or expired invitation token")

// ---------------------------------------------------------------------------
// Organization Invitations
// ---------------------------------------------------------------------------

// generateInvitationToken creates a cryptographically secure random token for invitations.
func generateInvitationToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random token: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

// CreateOrganizationInvitation creates a new invitation for an email to join an organization.
// Prevents duplicate pending invitations to the same email for the same organization.
func CreateOrganizationInvitation(ctx context.Context, pool *pgxpool.Pool, organizationID, inviterUserID, inviteeEmail string, message *string) (OrganizationInvitation, error) {
	var invitation OrganizationInvitation

	// Generate secure invitation token
	token, err := generateInvitationToken()
	if err != nil {
		return OrganizationInvitation{}, fmt.Errorf("failed to generate invitation token: %w", err)
	}

	// Set expiration to 7 days from now
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	err = pool.QueryRow(ctx, `
		INSERT INTO organization_invitations (organization_id, inviter_user_id, invitee_email, message, invitation_token, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, organization_id, inviter_user_id, invitee_email, invitee_user_id, status,
		          message, invitation_token, expires_at, created_at, accepted_at, declined_at`,
		organizationID, inviterUserID, inviteeEmail, message, token, expiresAt,
	).Scan(
		&invitation.ID, &invitation.OrganizationID, &invitation.InviterUserID, &invitation.InviteeEmail,
		&invitation.InviteeUserID, &invitation.Status, &invitation.Message, &invitation.InvitationToken,
		&invitation.ExpiresAt, &invitation.CreatedAt, &invitation.AcceptedAt, &invitation.DeclinedAt,
	)

	if err != nil {
		// Check for unique constraint violation (duplicate pending invitation)
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			return OrganizationInvitation{}, ErrDuplicateInvitation
		}
		return OrganizationInvitation{}, fmt.Errorf("failed to create organization invitation: %w", err)
	}

	return invitation, nil
}

// GetOrganizationInvitationByToken retrieves an invitation by its token.
func GetOrganizationInvitationByToken(ctx context.Context, pool *pgxpool.Pool, token string) (OrganizationInvitation, error) {
	var invitation OrganizationInvitation

	err := pool.QueryRow(ctx, `
		SELECT id, organization_id, inviter_user_id, invitee_email, invitee_user_id, status,
		       message, invitation_token, expires_at, created_at, accepted_at, declined_at
		FROM organization_invitations WHERE invitation_token = $1`,
		token,
	).Scan(
		&invitation.ID, &invitation.OrganizationID, &invitation.InviterUserID, &invitation.InviteeEmail,
		&invitation.InviteeUserID, &invitation.Status, &invitation.Message, &invitation.InvitationToken,
		&invitation.ExpiresAt, &invitation.CreatedAt, &invitation.AcceptedAt, &invitation.DeclinedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return OrganizationInvitation{}, ErrInvitationNotFound
	}

	return invitation, fmt.Errorf("fetching organization invitation by token: %w", err)
}

// GetOrganizationInvitation retrieves an invitation by its ID.
func GetOrganizationInvitation(ctx context.Context, pool *pgxpool.Pool, invitationID string) (OrganizationInvitation, error) {
	var invitation OrganizationInvitation

	err := pool.QueryRow(ctx, `
		SELECT id, organization_id, inviter_user_id, invitee_email, invitee_user_id, status,
		       message, invitation_token, expires_at, created_at, accepted_at, declined_at
		FROM organization_invitations WHERE id = $1`,
		invitationID,
	).Scan(
		&invitation.ID, &invitation.OrganizationID, &invitation.InviterUserID, &invitation.InviteeEmail,
		&invitation.InviteeUserID, &invitation.Status, &invitation.Message, &invitation.InvitationToken,
		&invitation.ExpiresAt, &invitation.CreatedAt, &invitation.AcceptedAt, &invitation.DeclinedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		return OrganizationInvitation{}, ErrInvitationNotFound
	}

	return invitation, fmt.Errorf("fetching organization invitation by ID: %w", err)
}

// ListPendingInvitationsForOrganization returns all pending invitations for an organization.
func ListPendingInvitationsForOrganization(ctx context.Context, pool *pgxpool.Pool, organizationID string) ([]OrganizationInvitation, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, organization_id, inviter_user_id, invitee_email, invitee_user_id, status,
		       message, invitation_token, expires_at, created_at, accepted_at, declined_at
		FROM organization_invitations
		WHERE organization_id = $1 AND status = 'pending' AND expires_at > NOW()
		ORDER BY created_at ASC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query pending invitations: %w", err)
	}
	defer rows.Close()

	var invitations []OrganizationInvitation
	for rows.Next() {
		var invitation OrganizationInvitation
		if err := rows.Scan(
			&invitation.ID, &invitation.OrganizationID, &invitation.InviterUserID, &invitation.InviteeEmail,
			&invitation.InviteeUserID, &invitation.Status, &invitation.Message, &invitation.InvitationToken,
			&invitation.ExpiresAt, &invitation.CreatedAt, &invitation.AcceptedAt, &invitation.DeclinedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan invitation: %w", err)
		}
		invitations = append(invitations, invitation)
	}

	return invitations, rows.Err()
}

// GetUserInvitations returns all invitations for a specific user email.
func GetUserInvitations(ctx context.Context, pool *pgxpool.Pool, email string) ([]OrganizationInvitation, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, organization_id, inviter_user_id, invitee_email, invitee_user_id, status,
		       message, invitation_token, expires_at, created_at, accepted_at, declined_at
		FROM organization_invitations
		WHERE invitee_email = $1
		ORDER BY created_at DESC`,
		email,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query user invitations: %w", err)
	}
	defer rows.Close()

	var invitations []OrganizationInvitation
	for rows.Next() {
		var invitation OrganizationInvitation
		if err := rows.Scan(
			&invitation.ID, &invitation.OrganizationID, &invitation.InviterUserID, &invitation.InviteeEmail,
			&invitation.InviteeUserID, &invitation.Status, &invitation.Message, &invitation.InvitationToken,
			&invitation.ExpiresAt, &invitation.CreatedAt, &invitation.AcceptedAt, &invitation.DeclinedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan invitation: %w", err)
		}
		invitations = append(invitations, invitation)
	}

	return invitations, rows.Err()
}

// AcceptInvitation accepts a pending invitation and adds the user to the organization.
func AcceptInvitation(ctx context.Context, pool *pgxpool.Pool, token, userID string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Get the invitation details and lock it
	var invitation OrganizationInvitation
	err = tx.QueryRow(ctx, `
		SELECT id, organization_id, invitee_email, status, expires_at
		FROM organization_invitations
		WHERE invitation_token = $1 FOR UPDATE`,
		token,
	).Scan(&invitation.ID, &invitation.OrganizationID, &invitation.InviteeEmail, &invitation.Status, &invitation.ExpiresAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidToken
	}
	if err != nil {
		return fmt.Errorf("failed to lock invitation: %w", err)
	}

	// Check if invitation is still valid
	if invitation.Status != InvitationStatusPending {
		return ErrInvalidToken
	}
	if time.Now().After(invitation.ExpiresAt) {
		return ErrInvalidToken
	}

	// Add user to organization as non-admin member
	err = AddUserToOrganizationTx(ctx, tx, userID, invitation.OrganizationID, false)
	if err != nil {
		return fmt.Errorf("failed to add user to organization: %w", err)
	}

	// Update invitation status
	_, err = tx.Exec(ctx, `
		UPDATE organization_invitations
		SET status = 'accepted', invitee_user_id = $1, accepted_at = NOW()
		WHERE invitation_token = $2`,
		userID, token,
	)
	if err != nil {
		return fmt.Errorf("failed to update invitation status: %w", err)
	}

	return tx.Commit(ctx)
}

// DeclineInvitation declines a pending invitation.
func DeclineInvitation(ctx context.Context, pool *pgxpool.Pool, token string) error {
	result, err := pool.Exec(ctx, `
		UPDATE organization_invitations
		SET status = 'declined', declined_at = NOW()
		WHERE invitation_token = $1 AND status = 'pending' AND expires_at > NOW()`,
		token,
	)
	if err != nil {
		return fmt.Errorf("failed to decline invitation: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrInvalidToken
	}
	return nil
}

// CancelInvitation allows an admin to cancel a pending invitation.
func CancelInvitation(ctx context.Context, pool *pgxpool.Pool, invitationID string) error {
	result, err := pool.Exec(ctx, `
		UPDATE organization_invitations
		SET status = 'expired'
		WHERE id = $1 AND status = 'pending'`,
		invitationID,
	)
	if err != nil {
		return fmt.Errorf("failed to cancel invitation: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrInvitationNotFound
	}
	return nil
}

// ExpireOldInvitations marks invitations as expired if they're past their expiry date.
func ExpireOldInvitations(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	result, err := pool.Exec(ctx, `
		UPDATE organization_invitations
		SET status = 'expired'
		WHERE status = 'pending' AND expires_at <= NOW()`)
	if err != nil {
		return 0, fmt.Errorf("failed to expire old invitations: %w", err)
	}
	return int(result.RowsAffected()), nil
}

// ---------------------------------------------------------------------------
// API Key Creation Requests
// ---------------------------------------------------------------------------

// CreateAPIKeyCreationRequest creates a new request for an API key within an organization.
func CreateAPIKeyCreationRequest(ctx context.Context, pool *pgxpool.Pool, requesterUserID, organizationID, keyName, justification string) (APIKeyCreationRequest, error) {
	var req APIKeyCreationRequest

	err := pool.QueryRow(ctx, `
		INSERT INTO api_key_creation_requests (requester_user_id, organization_id, requested_key_name, justification)
		VALUES ($1, $2, $3, $4)
		RETURNING id, requester_user_id, organization_id, requested_key_name, justification, status,
		          reviewed_by, reviewed_at, review_note, merchant_id, created_at,
		          approved_at, rejected_at, canceled_at`,
		requesterUserID, organizationID, keyName, justification,
	).Scan(
		&req.ID, &req.RequesterUserID, &req.OrganizationID, &req.RequestedKeyName, &req.Justification, &req.Status,
		&req.ReviewedBy, &req.ReviewedAt, &req.ReviewNote, &req.MerchantID, &req.CreatedAt,
		&req.ApprovedAt, &req.RejectedAt, &req.CanceledAt,
	)

	if err != nil {
		// Check for unique constraint violation (duplicate pending request)
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			return APIKeyCreationRequest{}, ErrDuplicateRequest
		}
		return APIKeyCreationRequest{}, fmt.Errorf("failed to create API key creation request: %w", err)
	}

	return req, nil
}

// ListPendingAPIKeyRequestsForOrganization returns all pending API key requests for an organization.
func ListPendingAPIKeyRequestsForOrganization(ctx context.Context, pool *pgxpool.Pool, organizationID string) ([]APIKeyCreationRequest, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, requester_user_id, organization_id, requested_key_name, justification, status,
		       reviewed_by, reviewed_at, review_note, merchant_id, created_at,
		       approved_at, rejected_at, canceled_at
		FROM api_key_creation_requests
		WHERE organization_id = $1 AND status = 'pending'
		ORDER BY created_at ASC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query pending API key requests: %w", err)
	}
	defer rows.Close()

	var requests []APIKeyCreationRequest
	for rows.Next() {
		var req APIKeyCreationRequest
		if err := rows.Scan(
			&req.ID, &req.RequesterUserID, &req.OrganizationID, &req.RequestedKeyName, &req.Justification, &req.Status,
			&req.ReviewedBy, &req.ReviewedAt, &req.ReviewNote, &req.MerchantID, &req.CreatedAt,
			&req.ApprovedAt, &req.RejectedAt, &req.CanceledAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan API key request: %w", err)
		}
		requests = append(requests, req)
	}

	return requests, rows.Err()
}

// ListAPIKeyCreationRequestsForUser returns all API key requests made by a specific user.
func ListAPIKeyCreationRequestsForUser(ctx context.Context, pool *pgxpool.Pool, userID string) ([]APIKeyCreationRequest, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, requester_user_id, organization_id, requested_key_name, justification, status,
		       reviewed_by, review_note, merchant_id, created_at, reviewed_at, approved_at, rejected_at, canceled_at
		FROM api_key_creation_requests
		WHERE requester_user_id = $1
		ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query user requests: %w", err)
	}
	defer rows.Close()

	var requests []APIKeyCreationRequest
	for rows.Next() {
		var req APIKeyCreationRequest
		err := rows.Scan(
			&req.ID, &req.RequesterUserID, &req.OrganizationID, &req.RequestedKeyName, &req.Justification,
			&req.Status, &req.ReviewedBy, &req.ReviewNote, &req.MerchantID, &req.CreatedAt,
			&req.ReviewedAt, &req.ApprovedAt, &req.RejectedAt, &req.CanceledAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan request: %w", err)
		}
		requests = append(requests, req)
	}

	return requests, rows.Err()
}

// ListAPIKeyCreationRequestsForOrganization returns all API key requests for an organization.
func ListAPIKeyCreationRequestsForOrganization(ctx context.Context, pool *pgxpool.Pool, organizationID string) ([]APIKeyCreationRequest, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, requester_user_id, organization_id, requested_key_name, justification, status,
		       reviewed_by, review_note, merchant_id, created_at, reviewed_at, approved_at, rejected_at, canceled_at
		FROM api_key_creation_requests
		WHERE organization_id = $1
		ORDER BY created_at DESC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query organization requests: %w", err)
	}
	defer rows.Close()

	var requests []APIKeyCreationRequest
	for rows.Next() {
		var req APIKeyCreationRequest
		err := rows.Scan(
			&req.ID, &req.RequesterUserID, &req.OrganizationID, &req.RequestedKeyName, &req.Justification,
			&req.Status, &req.ReviewedBy, &req.ReviewNote, &req.MerchantID, &req.CreatedAt,
			&req.ReviewedAt, &req.ApprovedAt, &req.RejectedAt, &req.CanceledAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan request: %w", err)
		}
		requests = append(requests, req)
	}

	return requests, rows.Err()
}

// RejectAPIKeyCreationRequest rejects a pending API key request.
func RejectAPIKeyCreationRequest(ctx context.Context, pool *pgxpool.Pool, requestID, reviewerUserID string, reviewNote *string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Get the request details and lock it
	var req APIKeyCreationRequest
	err = tx.QueryRow(ctx, `
		SELECT id, requester_user_id, organization_id, requested_key_name, status
		FROM api_key_creation_requests
		WHERE id = $1 FOR UPDATE`,
		requestID,
	).Scan(&req.ID, &req.RequesterUserID, &req.OrganizationID, &req.RequestedKeyName, &req.Status)

	if errors.Is(err, pgx.ErrNoRows) {
		return ErrRequestNotFound
	}
	if err != nil {
		return fmt.Errorf("failed to lock request: %w", err)
	}

	if req.Status != RequestStatusPending {
		return ErrInvalidRequestStatus
	}

	// Update the request status
	_, err = tx.Exec(ctx, `
		UPDATE api_key_creation_requests
		SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(),
		    review_note = $2, rejected_at = NOW()
		WHERE id = $3`,
		reviewerUserID, reviewNote, requestID,
	)
	if err != nil {
		return fmt.Errorf("failed to update request status: %w", err)
	}

	return tx.Commit(ctx)
}

// CreateAPIKeyFunc is a function type for creating API keys.
type CreateAPIKeyFunc func(ctx context.Context, pool *pgxpool.Pool, organizationID, name string) (*Merchant, string, error)

// ApproveAPIKeyCreationRequest approves a pending API key request and creates the actual API key.
// The createAPIKeyFunc parameter should be auth.CreateAPIKey to avoid circular imports.
func ApproveAPIKeyCreationRequest(ctx context.Context, pool *pgxpool.Pool, requestID, reviewerUserID string, reviewNote *string, createAPIKeyFunc CreateAPIKeyFunc) (Merchant, string, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return Merchant{}, "", fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Get the request details and lock it
	var req APIKeyCreationRequest
	err = tx.QueryRow(ctx, `
		SELECT id, requester_user_id, organization_id, requested_key_name, status
		FROM api_key_creation_requests
		WHERE id = $1 FOR UPDATE`,
		requestID,
	).Scan(&req.ID, &req.RequesterUserID, &req.OrganizationID, &req.RequestedKeyName, &req.Status)

	if errors.Is(err, pgx.ErrNoRows) {
		return Merchant{}, "", ErrRequestNotFound
	}
	if err != nil {
		return Merchant{}, "", fmt.Errorf("failed to lock request: %w", err)
	}

	if req.Status != RequestStatusPending {
		return Merchant{}, "", ErrInvalidRequestStatus
	}

	// Commit the transaction to release the lock, then create the API key
	err = tx.Commit(ctx)
	if err != nil {
		return Merchant{}, "", fmt.Errorf("failed to commit transaction: %w", err)
	}

	// Create the API key using the provided function (which has its own transaction)
	merchant, fullKey, err := createAPIKeyFunc(ctx, pool, req.OrganizationID, req.RequestedKeyName)
	if err != nil {
		return Merchant{}, "", fmt.Errorf("failed to create API key: %w", err)
	}

	// Update the request with the created merchant ID and approval status
	_, err = pool.Exec(ctx, `
		UPDATE api_key_creation_requests
		SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(),
		    review_note = $2, approved_at = NOW(), merchant_id = $4
		WHERE id = $3`,
		reviewerUserID, reviewNote, requestID, merchant.ID,
	)
	if err != nil {
		return Merchant{}, "", fmt.Errorf("failed to update request status: %w", err)
	}

	return *merchant, fullKey, nil
}

// AddUserToOrganizationTx adds a user to an organization within an existing transaction.
func AddUserToOrganizationTx(ctx context.Context, tx pgx.Tx, userID, organizationID string, isAdmin bool) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO organization_members (user_id, organization_id, is_admin)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, organization_id) DO UPDATE
			SET is_admin = EXCLUDED.is_admin,
			    joined_at = NOW()`,
		userID, organizationID, isAdmin,
	)
	return err
}