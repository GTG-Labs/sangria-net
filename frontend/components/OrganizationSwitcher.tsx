"use client";

import { useState, useEffect } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { organizationsAPI, Organization, APIError } from "@/lib/api";

interface OrganizationSwitcherProps {
  selectedOrganization?: Organization | null;
  onOrganizationChange?: (org: Organization) => void;
  className?: string;
}

export default function OrganizationSwitcher({
  selectedOrganization,
  onOrganizationChange,
  className = ""
}: OrganizationSwitcherProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const orgs = await organizationsAPI.list();
      setOrganizations(orgs);

      // Auto-select first organization if none selected
      if (!selectedOrganization && orgs.length > 0 && onOrganizationChange) {
        onOrganizationChange(orgs[0]);
      }
    } catch (err) {
      console.error("Failed to load organizations:", err);
      setError(err instanceof APIError ? err.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (org: Organization) => {
    setIsOpen(false);
    if (onOrganizationChange) {
      onOrganizationChange(org);
    }
  };

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-200 rounded-lg h-10 w-48 ${className}`} />
    );
  }

  if (error || organizations.length === 0) {
    return null;
  }

  // Don't show switcher if user only has one organization
  if (organizations.length === 1) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg ${className}`}>
        <Building2 className="h-4 w-4 text-gray-600" />
        <span className="text-sm font-medium text-gray-900">
          {organizations[0].name}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900 truncate">
            {selectedOrganization?.name || "Select Organization"}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-60 overflow-auto">
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSelect(org)}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-600" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{org.name}</div>
                    {org.is_admin && (
                      <div className="text-xs text-blue-600">Admin</div>
                    )}
                  </div>
                </div>
                {selectedOrganization?.id === org.id && (
                  <Check className="h-4 w-4 text-blue-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}