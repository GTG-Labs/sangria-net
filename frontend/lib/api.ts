/**
 * API utility for communicating with the Sangria backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: options.credentials ?? 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new APIError(response.status, errorData.error || 'Request failed');
  }

  // Handle empty responses (204 No Content) or non-JSON responses
  if (response.status === 204 || !response.headers.get('content-type')?.includes('application/json')) {
    return undefined;
  }

  return response.json();
}

// Organization types
export interface Organization {
  id: string;
  name: string;
  created_at: string;
  is_admin: boolean;
  joined_at: string;
}

export interface CreateOrganizationRequest {
  name: string;
}

export interface InviteMemberRequest {
  email: string;
  message?: string;
}

export interface Invitation {
  id: string;
  invitee_email: string;
  status: string;
  message?: string;
  expires_at: string;
  created_at: string;
}

// API Key Request types
export interface APIKeyRequest {
  id: string;
  requester_user_id: string;
  organization_id: string;
  requested_key_name: string;
  justification: string;
  status: 'pending' | 'approved' | 'rejected' | 'canceled';
  reviewed_by?: string;
  review_note?: string;
  merchant_id?: string;
  created_at: string;
  reviewed_at?: string;
  approved_at?: string;
  rejected_at?: string;
}

export interface CreateAPIKeyRequestRequest {
  organization_id: string;
  key_name: string;
  justification?: string;
}

export interface ReviewAPIKeyRequestRequest {
  review_note?: string;
}

export interface AcceptInvitationRequest {
  token: string;
}

// Organization API
export const organizationsAPI = {
  // List user's organizations
  list: (): Promise<Organization[]> =>
    apiCall('/internal/organizations'),

  // Create new organization
  create: (data: CreateOrganizationRequest): Promise<Organization> =>
    apiCall('/internal/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Invite member to organization
  inviteMember: (organizationId: string, data: InviteMemberRequest): Promise<Invitation> =>
    apiCall(`/internal/organizations/${organizationId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // List pending invitations for organization
  listInvitations: (organizationId: string): Promise<Invitation[]> =>
    apiCall(`/internal/organizations/${organizationId}/invitations`),
};

// API Key Request API
export const apiKeyRequestsAPI = {
  // List user's API key requests or admin view for organization
  list: (organizationId?: string): Promise<APIKeyRequest[]> => {
    const params = organizationId ? `?organization_id=${organizationId}` : '';
    return apiCall(`/internal/api-key-requests${params}`);
  },

  // Create new API key request
  create: (data: CreateAPIKeyRequestRequest): Promise<APIKeyRequest> =>
    apiCall('/internal/api-key-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Approve API key request (admin only)
  approve: (requestId: string, data?: ReviewAPIKeyRequestRequest): Promise<any> =>
    apiCall(`/internal/api-key-requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  // Reject API key request (admin only)
  reject: (requestId: string, data?: ReviewAPIKeyRequestRequest): Promise<any> =>
    apiCall(`/internal/api-key-requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
};

// Invitations API
export const invitationsAPI = {
  // Accept invitation using token
  accept: (data: AcceptInvitationRequest): Promise<any> =>
    apiCall('/internal/invitations/accept', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Existing API Keys (keeping existing functionality)
export interface APIKey {
  id: string;
  organization_id: string;
  key_id: string;
  name: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export const apiKeysAPI = {
  // List API keys (with organization context)
  list: (organizationId?: string): Promise<APIKey[]> => {
    const params = organizationId ? `?organization_id=${organizationId}` : '';
    return apiCall(`/internal/api-keys${params}`);
  },

  // Delete API key (admin only)
  delete: (keyId: string): Promise<void> =>
    apiCall(`/internal/api-keys/${keyId}`, {
      method: 'DELETE',
    }),
};