"use client";

import { useState, useEffect } from "react";
import { Key, Plus, Clock, CheckCircle, XCircle, AlertCircle, Building2, MessageSquare } from "lucide-react";
import ArcadeButton from "@/components/ArcadeButton";
import OrganizationSwitcher from "@/components/OrganizationSwitcher";
import {
  apiKeyRequestsAPI,
  organizationsAPI,
  APIKeyRequest,
  Organization,
  APIError
} from "@/lib/api";

export default function APIKeyRequestsContent() {
  const [requests, setRequests] = useState<APIKeyRequest[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Request State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [keyName, setKeyName] = useState("");
  const [justification, setJustification] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  // Admin Review State
  const [reviewingRequest, setReviewingRequest] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  // Created API Key Display
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showCreatedKey, setShowCreatedKey] = useState(false);

  // Selected organization for admin view
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedOrganization) {
      loadRequests();
    }
  }, [selectedOrganization]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [orgsData, requestsData] = await Promise.all([
        organizationsAPI.list(),
        apiKeyRequestsAPI.list()
      ]);

      setOrganizations(orgsData);
      setRequests(requestsData);

      // Set default organization
      if (orgsData.length > 0 && !selectedOrganization) {
        setSelectedOrganization(orgsData[0]);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
      setError(err instanceof APIError ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      const requestsData = selectedOrganization?.id
        ? await apiKeyRequestsAPI.list(selectedOrganization.id)
        : await apiKeyRequestsAPI.list();
      setRequests(requestsData);
    } catch (err) {
      console.error("Failed to load requests:", err);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !keyName.trim()) return;

    try {
      setCreateLoading(true);
      const newRequest = await apiKeyRequestsAPI.create({
        organization_id: selectedOrgId,
        key_name: keyName.trim(),
        justification: justification.trim() || undefined,
      });

      setRequests(prev => [newRequest, ...prev]);

      // Reset form
      setSelectedOrgId("");
      setKeyName("");
      setJustification("");
      setShowCreateForm(false);
    } catch (err) {
      console.error("Failed to create request:", err);
      setError(err instanceof APIError ? err.message : "Failed to create request");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    try {
      setReviewLoading(true);
      const result = await apiKeyRequestsAPI.approve(requestId, {
        review_note: reviewNote.trim() || undefined,
      });

      // Show the created API key (only shown once!)
      setCreatedKey(result.api_key);
      setShowCreatedKey(true);

      // Update request status
      setRequests(prev => prev.map(req =>
        req.id === requestId
          ? { ...req, status: 'approved', reviewed_at: new Date().toISOString() }
          : req
      ));

      setReviewingRequest(null);
      setReviewNote("");
    } catch (err) {
      console.error("Failed to approve request:", err);
      setError(err instanceof APIError ? err.message : "Failed to approve request");
    } finally {
      setReviewLoading(false);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      setReviewLoading(true);
      await apiKeyRequestsAPI.reject(requestId, {
        review_note: reviewNote.trim() || undefined,
      });

      // Update request status
      setRequests(prev => prev.map(req =>
        req.id === requestId
          ? { ...req, status: 'rejected', reviewed_at: new Date().toISOString() }
          : req
      ));

      setReviewingRequest(null);
      setReviewNote("");
    } catch (err) {
      console.error("Failed to reject request:", err);
      setError(err instanceof APIError ? err.message : "Failed to reject request");
    } finally {
      setReviewLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const isAdmin = selectedOrganization?.is_admin || false;
  const userOrganizations = organizations;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Key className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-500">Loading API key requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Key Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isAdmin ? "Manage API key requests and approvals" : "Request API keys for your organizations"}
          </p>
        </div>
        <ArcadeButton
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Request API Key
        </ArcadeButton>
      </div>

      {/* Organization Switcher */}
      {organizations.length > 1 && (
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Organization:</span>
          <OrganizationSwitcher
            selectedOrganization={selectedOrganization}
            onOrganizationChange={setSelectedOrganization}
            className="w-64"
          />
        </div>
      )}

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


      {/* Create Request Form */}
      {showCreateForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Request New API Key</h3>
          <form onSubmit={handleCreateRequest} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Organization
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                required
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Select organization</option>
                {userOrganizations.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name} {org.is_admin ? "(Admin)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key Name
              </label>
              <input
                type="text"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="e.g., Production API Key"
                required
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Justification (Optional)
              </label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain why you need this API key..."
                rows={3}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <ArcadeButton type="submit" disabled={createLoading}>
                {createLoading ? "Creating Request..." : "Submit Request"}
              </ArcadeButton>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setSelectedOrgId("");
                  setKeyName("");
                  setJustification("");
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Requests List */}
      <div className="space-y-4">
        {requests.map((request) => {
          const org = organizations.find(o => o.id === request.organization_id);
          const isCurrentUserAdmin = org?.is_admin;

          return (
            <div key={request.id} className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Key className="h-5 w-5 text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900">{request.requested_key_name}</h3>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(request.status)}
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(request.status)}`}>
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <span>{org?.name || 'Unknown Organization'}</span>
                    </div>
                    <div>
                      <span className="font-medium">Requested:</span> {new Date(request.created_at).toLocaleString()}
                    </div>
                    {request.justification && (
                      <div>
                        <span className="font-medium">Justification:</span> {request.justification}
                      </div>
                    )}
                    {request.review_note && (
                      <div>
                        <span className="font-medium">Review Note:</span> {request.review_note}
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin Actions */}
                {isCurrentUserAdmin && request.status === 'pending' && (
                  <div className="flex gap-2">
                    <ArcadeButton
                      size="sm"
                      onClick={() => setReviewingRequest(request.id)}
                      className="flex items-center gap-2"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Review
                    </ArcadeButton>
                  </div>
                )}
              </div>

              {/* Review Form */}
              {reviewingRequest === request.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Review Note (Optional)
                      </label>
                      <textarea
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="Add a note about your decision..."
                        rows={2}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-3">
                      <ArcadeButton
                        onClick={() => handleApproveRequest(request.id)}
                        disabled={reviewLoading}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {reviewLoading ? "Processing..." : "Approve"}
                      </ArcadeButton>
                      <ArcadeButton
                        onClick={() => handleRejectRequest(request.id)}
                        disabled={reviewLoading}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {reviewLoading ? "Processing..." : "Reject"}
                      </ArcadeButton>
                      <button
                        onClick={() => {
                          setReviewingRequest(null);
                          setReviewNote("");
                        }}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {requests.length === 0 && !loading && (
        <div className="text-center py-12">
          <Key className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No API key requests</h3>
          <p className="text-gray-500 mb-6">
            {isAdmin ? "No requests to review at the moment" : "Create your first API key request to get started"}
          </p>
          <ArcadeButton onClick={() => setShowCreateForm(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Request API Key
          </ArcadeButton>
        </div>
      )}

      {/* Created API Key Modal */}
      {showCreatedKey && createdKey && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black bg-opacity-25" />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  API Key Created Successfully!
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  This is your new API key. <strong>Save it now</strong> - you won&apos;t be able to see it again.
                </p>
                <div className="bg-gray-100 p-4 rounded-lg mb-4">
                  <code className="text-sm break-all">{createdKey}</code>
                </div>
                <ArcadeButton
                  onClick={() => {
                    navigator.clipboard.writeText(createdKey);
                    setShowCreatedKey(false);
                    setCreatedKey(null);
                  }}
                  className="w-full mb-2"
                >
                  Copy Key & Close
                </ArcadeButton>
                <button
                  onClick={() => {
                    setShowCreatedKey(false);
                    setCreatedKey(null);
                  }}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Close without copying
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}