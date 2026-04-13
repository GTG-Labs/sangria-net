"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Building2, Check, X, AlertCircle, ArrowRight } from "lucide-react";
import ArcadeButton from "@/components/ArcadeButton";
import { invitationsAPI, APIError } from "@/lib/api";

export default function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleAcceptInvitation = async () => {
    if (!token) {
      setError("Invalid invitation token");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await invitationsAPI.accept({ token });
      setSuccess(true);
    } catch (err) {
      console.error("Failed to accept invitation:", err);
      setError(err instanceof APIError ? err.message : "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <X className="mx-auto h-12 w-12 text-red-400 mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
            <p className="text-gray-600 mb-6">
              This invitation link is invalid or missing required information.
            </p>
            <ArcadeButton onClick={() => router.push("/dashboard")} className="w-full">
              Go to Dashboard
            </ArcadeButton>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <Check className="mx-auto h-12 w-12 text-green-400 mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation Accepted!</h1>
            <p className="text-gray-600 mb-6">
              You have successfully joined the organization. You can now access shared resources and collaborate with team members.
            </p>
            <ArcadeButton onClick={() => router.push("/dashboard")} className="w-full flex items-center justify-center gap-2">
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </ArcadeButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <Building2 className="mx-auto h-12 w-12 text-blue-400 mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Organization Invitation</h1>
            <p className="text-gray-600">
              You&apos;ve been invited to join an organization. Click below to accept the invitation and gain access to shared resources.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200">
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

          <div className="space-y-4">
            <ArcadeButton
              onClick={handleAcceptInvitation}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2"
            >
              {loading ? "Accepting..." : "Accept Invitation"}
              {!loading && <Check className="h-4 w-4" />}
            </ArcadeButton>

            <button
              onClick={() => router.push("/dashboard")}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}