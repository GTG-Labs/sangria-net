"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle, Loader, LogIn } from "lucide-react";
import { handleSignIn } from "@/lib/auth-actions";

export default function AcceptInvitationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "enter_email">("enter_email");
  const [message, setMessage] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid invitation link. No token found.");
    }
  }, [token]);

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage("Please enter your email address");
      return;
    }

    setIsProcessing(true);
    setStatus("loading");

    try {
      const response = await fetch("/api/backend/accept-invitation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, email: email.trim().toLowerCase() }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage("Invitation accepted successfully! Your account has been created and you've been added to the organization.");
        setOrganizationId(data.organization_id);
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to accept invitation.");
      }
    } catch (error) {
      console.error("Failed to accept invitation:", error);
      setStatus("error");
      setMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            {status === "enter_email" && (
              <>
                <h2 className="mt-4 text-xl font-bold text-gray-900">
                  🎉 Accept Your Invitation
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Enter your email address to join the organization
                </p>
                <form onSubmit={handleAcceptInvitation} className="mt-6 space-y-4">
                  <div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      disabled={isProcessing}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isProcessing || !email.trim()}
                    className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? "Processing..." : "Accept Invitation"}
                  </button>
                </form>
                {message && (
                  <p className="mt-2 text-sm text-red-600">{message}</p>
                )}
              </>
            )}

            {status === "loading" && (
              <>
                <Loader className="mx-auto h-12 w-12 text-blue-500 animate-spin" />
                <h2 className="mt-4 text-xl font-bold text-gray-900">
                  Processing Invitation
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Creating your account and adding you to the organization...
                </p>
              </>
            )}

            {status === "success" && (
              <>
                <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                <h2 className="mt-4 text-xl font-bold text-green-900">
                  Welcome to the Team! 🎉
                </h2>
                <p className="mt-2 text-sm text-gray-600">{message}</p>
                <p className="mt-4 text-sm text-gray-500">
                  Now you need to sign in to access your account and the organization.
                </p>
                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => handleSignIn()}
                    className="w-full inline-flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Sign In to Continue
                  </button>
                </div>
              </>
            )}

            {status === "error" && (
              <>
                <XCircle className="mx-auto h-12 w-12 text-red-500" />
                <h2 className="mt-4 text-xl font-bold text-red-900">
                  Invitation Error
                </h2>
                <p className="mt-2 text-sm text-gray-600">{message}</p>
                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => {
                      setStatus("enter_email");
                      setMessage("");
                    }}
                    className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Try Again
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}