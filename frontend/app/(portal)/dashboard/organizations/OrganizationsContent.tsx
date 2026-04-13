"use client";

import { useState, useEffect } from "react";
import { Building2, Plus, Users, Mail, Crown, Calendar, AlertCircle } from "lucide-react";
import ArcadeButton from "@/components/ArcadeButton";
import { organizationsAPI, Organization, Invitation, APIError } from "@/lib/api";

export default function OrganizationsContent() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [invitations, setInvitations] = useState<{ [orgId: string]: Invitation[] }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Organization State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Invite Member State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const orgs = await organizationsAPI.list();
      setOrganizations(orgs);

      // Load invitations for admin organizations
      const invitationsData: { [orgId: string]: Invitation[] } = {};
      await Promise.all(
        orgs
          .filter(org => org.is_admin)
          .map(async (org) => {
            try {
              invitationsData[org.id] = await organizationsAPI.listInvitations(org.id);
            } catch (err) {
              console.warn(`Failed to load invitations for org ${org.id}:`, err);
            }
          })
      );
      setInvitations(invitationsData);
    } catch (err) {
      console.error("Failed to load organizations:", err);
      setError(err instanceof APIError ? err.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    try {
      setCreateLoading(true);
      const newOrg = await organizationsAPI.create({ name: newOrgName.trim() });
      setOrganizations(prev => [...prev, { ...newOrg, is_admin: true, joined_at: new Date().toISOString() }]);
      setNewOrgName("");
      setShowCreateForm(false);
    } catch (err) {
      console.error("Failed to create organization:", err);
      setError(err instanceof APIError ? err.message : "Failed to create organization");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedOrg) return;

    try {
      setInviteLoading(true);
      const invitation = await organizationsAPI.inviteMember(selectedOrg.id, {
        email: inviteEmail.trim(),
        message: inviteMessage.trim() || undefined,
      });

      // Update invitations list
      setInvitations(prev => ({
        ...prev,
        [selectedOrg.id]: [...(prev[selectedOrg.id] || []), invitation],
      }));

      // Reset form
      setInviteEmail("");
      setInviteMessage("");
      setShowInviteModal(false);
      setSelectedOrg(null);
    } catch (err) {
      console.error("Failed to invite member:", err);
      setError(err instanceof APIError ? err.message : "Failed to send invitation");
    } finally {
      setInviteLoading(false);
    }
  };

  const openInviteModal = (org: Organization) => {
    setSelectedOrg(org);
    setShowInviteModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-500">Loading organizations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your organizations and team members
          </p>
        </div>
        <ArcadeButton
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Organization
        </ArcadeButton>
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 border border-red-200">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Organization Form */}
      {showCreateForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Organization</h3>
          <form onSubmit={handleCreateOrganization} className="space-y-4">
            <div>
              <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 mb-2">
                Organization Name
              </label>
              <input
                type="text"
                id="orgName"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Enter organization name"
                required
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <ArcadeButton type="submit" disabled={createLoading} className="flex items-center gap-2">
                {createLoading ? "Creating..." : "Create Organization"}
              </ArcadeButton>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewOrgName("");
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Organizations List */}
      <div className="space-y-4">
        {organizations.map((org) => (
          <div key={org.id} className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Building2 className="h-5 w-5 text-gray-400" />
                  <h3 className="text-lg font-semibold text-gray-900">{org.name}</h3>
                  {org.is_admin && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                      <Crown className="h-3 w-3" />
                      Admin
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Joined {new Date(org.joined_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {org.is_admin && (
                <div className="flex gap-2">
                  <ArcadeButton
                    size="sm"
                    onClick={() => openInviteModal(org)}
                    className="flex items-center gap-2"
                  >
                    <Users className="h-4 w-4" />
                    Invite Members
                  </ArcadeButton>
                </div>
              )}
            </div>

            {/* Pending Invitations */}
            {org.is_admin && invitations[org.id] && invitations[org.id].length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Pending Invitations</h4>
                <div className="space-y-2">
                  {invitations[org.id].map((invitation) => (
                    <div key={invitation.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{invitation.invitee_email}</span>
                        <span className="text-xs text-gray-500">
                          Expires {new Date(invitation.expires_at).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="text-xs text-yellow-600 font-medium">Pending</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {organizations.length === 0 && !loading && (
        <div className="text-center py-12">
          <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No organizations yet</h3>
          <p className="text-gray-500 mb-6">Create your first organization to get started</p>
          <ArcadeButton onClick={() => setShowCreateForm(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Organization
          </ArcadeButton>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && selectedOrg && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-25" onClick={() => setShowInviteModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Invite Member to {selectedOrg.name}
              </h3>
              <form onSubmit={handleInviteMember} className="space-y-4">
                <div>
                  <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="inviteEmail"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Enter email address"
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="inviteMessage" className="block text-sm font-medium text-gray-700 mb-2">
                    Personal Message (Optional)
                  </label>
                  <textarea
                    id="inviteMessage"
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    placeholder="Add a personal message to the invitation..."
                    rows={3}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-3">
                  <ArcadeButton type="submit" disabled={inviteLoading} className="flex-1">
                    {inviteLoading ? "Sending..." : "Send Invitation"}
                  </ArcadeButton>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setSelectedOrg(null);
                      setInviteEmail("");
                      setInviteMessage("");
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}