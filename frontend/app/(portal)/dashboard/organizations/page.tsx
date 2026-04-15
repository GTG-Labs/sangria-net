"use client";

import { useState, useEffect } from "react";
import { Building, Users, Plus, Settings, UserPlus } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  isPersonal: boolean;
  isAdmin: boolean;
}

interface UserInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
  organizations: Organization[];
}

export default function OrganizationsPage() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch("/api/backend/me");
        if (response.ok) {
          const user = await response.json();
          setUserInfo(user);
        }
      } catch (err) {
        console.error("Failed to fetch user info:", err);
      }
    };

    fetchUserInfo();
  }, []);

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim()) return;

    try {
      const response = await fetch("/api/backend/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });

      if (response.ok) {
        const newOrg = await response.json();
        setUserInfo(prev => prev ? {
          ...prev,
          organizations: [...prev.organizations, newOrg]
        } : null);
        setNewOrgName("");
        setIsCreating(false);
      } else {
        console.error("Failed to create organization");
      }
    } catch (err) {
      console.error("Error creating organization:", err);
    }
  };

  if (!userInfo) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-600 mt-1">
            Manage your organizations and invite team members
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Organization
        </button>
      </div>

      {/* Create Organization Form */}
      {isCreating && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Create New Organization
          </h3>
          <div className="space-y-4">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreateOrganization}
                disabled={!newOrgName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewOrgName("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Organizations List */}
      <div className="grid gap-4">
        {userInfo.organizations.map((org) => (
          <div
            key={org.id}
            className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {org.isPersonal ? (
                  <Users className="h-8 w-8 text-blue-600" />
                ) : (
                  <Building className="h-8 w-8 text-green-600" />
                )}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {org.name}
                    {org.isPersonal && (
                      <span className="ml-2 text-sm text-gray-500 font-normal">(Personal)</span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    {org.isAdmin && (
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                        Admin
                      </span>
                    )}
                    <span className="text-sm text-gray-600">
                      {org.isPersonal ? "Personal organization" : "Team organization"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {org.isAdmin && !org.isPersonal && (
                  <button className="flex items-center gap-2 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <UserPlus className="h-4 w-4" />
                    Invite Members
                  </button>
                )}
                {org.isAdmin && (
                  <button className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {userInfo.organizations.length === 0 && (
        <div className="text-center py-12">
          <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No organizations</h3>
          <p className="text-gray-600 mb-6">
            Create your first organization to get started with team collaboration.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Organization
          </button>
        </div>
      )}
    </div>
  );
}