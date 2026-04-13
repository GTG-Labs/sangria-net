package dbengine

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UpsertUser creates or updates a user (WorkOS identity) and returns the full row.
func UpsertUser(ctx context.Context, pool *pgxpool.Pool, owner, workosID string) (User, error) {
	var u User
	err := pool.QueryRow(ctx,
		`INSERT INTO users (workos_id, owner)
		 VALUES ($1, $2)
		 ON CONFLICT (workos_id) DO UPDATE
		 	SET owner = EXCLUDED.owner,
		 	    updated_at = NOW()
		 RETURNING workos_id, owner, created_at, updated_at`,
		workosID, owner,
	).Scan(&u.WorkosID, &u.Owner, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

// UpsertUserTx creates or updates a user (WorkOS identity) within a transaction and returns the full row.
func UpsertUserTx(ctx context.Context, tx pgx.Tx, owner, workosID string) (User, error) {
	var u User
	err := tx.QueryRow(ctx,
		`INSERT INTO users (workos_id, owner)
		 VALUES ($1, $2)
		 ON CONFLICT (workos_id) DO UPDATE
		 	SET owner = EXCLUDED.owner,
		 	    updated_at = NOW()
		 RETURNING workos_id, owner, created_at, updated_at`,
		workosID, owner,
	).Scan(&u.WorkosID, &u.Owner, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

// GetUserByWorkosID returns a user by their WorkOS ID.
func GetUserByWorkosID(ctx context.Context, pool *pgxpool.Pool, workosID string) (User, error) {
	var u User
	err := pool.QueryRow(ctx,
		`SELECT workos_id, owner, created_at, updated_at
		 FROM users WHERE workos_id = $1`,
		workosID,
	).Scan(&u.WorkosID, &u.Owner, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

// AddUserToOrganization adds a user to an organization with specified admin status
func AddUserToOrganization(ctx context.Context, pool *pgxpool.Pool, userID, organizationID string, isAdmin bool) error {
	_, err := pool.Exec(ctx,
		`INSERT INTO organization_members (user_id, organization_id, is_admin, joined_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (user_id, organization_id) DO UPDATE
		 	SET is_admin = EXCLUDED.is_admin`,
		userID, organizationID, isAdmin,
	)
	return err
}

// GetUserOrganizations returns all organizations for a user with their admin status
func GetUserOrganizations(ctx context.Context, pool *pgxpool.Pool, userID string) ([]OrganizationMember, error) {
	rows, err := pool.Query(ctx,
		`SELECT user_id, organization_id, is_admin, joined_at
		 FROM organization_members
		 WHERE user_id = $1
		 ORDER BY joined_at ASC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var memberships []OrganizationMember
	for rows.Next() {
		var m OrganizationMember
		if err := rows.Scan(&m.UserID, &m.OrganizationID, &m.IsAdmin, &m.JoinedAt); err != nil {
			return nil, err
		}
		memberships = append(memberships, m)
	}
	return memberships, rows.Err()
}

// IsAdmin returns true if the given WorkOS user ID has an entry in the admins table.
func IsAdmin(ctx context.Context, pool *pgxpool.Pool, workosID string) (bool, error) {
	var exists bool
	err := pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM admins WHERE user_id = $1)`,
		workosID,
	).Scan(&exists)
	return exists, err
}

// IsOrganizationAdmin returns true if the given user is an admin of the specified organization.
func IsOrganizationAdmin(ctx context.Context, pool *pgxpool.Pool, userID, organizationID string) (bool, error) {
	var isAdmin bool
	err := pool.QueryRow(ctx,
		`SELECT is_admin FROM organization_members
		 WHERE user_id = $1 AND organization_id = $2`,
		userID, organizationID,
	).Scan(&isAdmin)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil // User is not a member of the organization
		}
		return false, err
	}
	return isAdmin, nil
}

// IsOrganizationMember returns true if the given user is a member of the specified organization.
func IsOrganizationMember(ctx context.Context, pool *pgxpool.Pool, userID, organizationID string) (bool, error) {
	var exists bool
	err := pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND organization_id = $2)`,
		userID, organizationID,
	).Scan(&exists)
	return exists, err
}

// CreateOrganization creates a new organization and makes the creator an admin.
func CreateOrganization(ctx context.Context, pool *pgxpool.Pool, name, creatorUserID string) (Organization, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return Organization{}, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Create the organization
	var org Organization
	err = tx.QueryRow(ctx, `
		INSERT INTO organizations (name, created_at)
		VALUES ($1, NOW())
		RETURNING id, name, created_at`,
		name,
	).Scan(&org.ID, &org.Name, &org.CreatedAt)
	if err != nil {
		return Organization{}, fmt.Errorf("failed to create organization: %w", err)
	}

	// Add the creator as an admin
	err = AddUserToOrganizationTx(ctx, tx, creatorUserID, org.ID, true)
	if err != nil {
		return Organization{}, fmt.Errorf("failed to add creator as admin: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Organization{}, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return org, nil
}

// GetOrganizationByID returns an organization by its ID.
func GetOrganizationByID(ctx context.Context, pool *pgxpool.Pool, organizationID string) (Organization, error) {
	var org Organization
	err := pool.QueryRow(ctx,
		`SELECT id, name, created_at FROM organizations WHERE id = $1`,
		organizationID,
	).Scan(&org.ID, &org.Name, &org.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return org, fmt.Errorf("organization not found")
	}
	return org, err
}

// GetOrganizationsByMemberships returns organization details for a list of memberships.
func GetOrganizationsByMemberships(ctx context.Context, pool *pgxpool.Pool, memberships []OrganizationMember) ([]OrganizationWithMembership, error) {
	if len(memberships) == 0 {
		return []OrganizationWithMembership{}, nil
	}

	// Build query with organization IDs
	orgIDs := make([]string, len(memberships))
	for i, m := range memberships {
		orgIDs[i] = m.OrganizationID
	}

	// Create placeholders for the IN clause
	placeholders := ""
	args := make([]interface{}, len(orgIDs))
	for i, id := range orgIDs {
		if i > 0 {
			placeholders += ", "
		}
		placeholders += fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	rows, err := pool.Query(ctx,
		fmt.Sprintf(`SELECT id, name, created_at FROM organizations WHERE id IN (%s) ORDER BY name`, placeholders),
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query organizations: %w", err)
	}
	defer rows.Close()

	// Create map for quick membership lookup
	membershipMap := make(map[string]OrganizationMember)
	for _, m := range memberships {
		membershipMap[m.OrganizationID] = m
	}

	var results []OrganizationWithMembership
	for rows.Next() {
		var org Organization
		if err := rows.Scan(&org.ID, &org.Name, &org.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan organization: %w", err)
		}

		membership := membershipMap[org.ID]
		results = append(results, OrganizationWithMembership{
			Organization: org,
			IsAdmin:      membership.IsAdmin,
			JoinedAt:     membership.JoinedAt,
		})
	}

	return results, rows.Err()
}
