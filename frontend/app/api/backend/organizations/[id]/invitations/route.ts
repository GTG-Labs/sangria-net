import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";
import { ServerCSRFProtection } from "@/lib/csrf-server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    // Clone request to avoid body consumption issues
    const clonedRequest = request.clone();

    // Validate CSRF token for invitation operations
    const isValidCSRF = await ServerCSRFProtection.validateRequestToken(clonedRequest);
    if (!isValidCSRF) {
      return new Response(JSON.stringify({ error: "Invalid CSRF token" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse JSON with isolated error handling
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error('Invalid JSON in organization invitation request:', error);
      return new Response(JSON.stringify({ error: "Invalid request format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate body is a plain object (not array)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Remove CSRF token from body before forwarding to backend
    const { csrf_token: _csrf_token, ...sanitizedBody } = body;

    return proxyToBackend("POST", `/internal/organizations/${encodeURIComponent(id)}/invitations`, { body: sanitizedBody });
  } catch (error) {
    console.error('Error in organization invitation request:', error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}