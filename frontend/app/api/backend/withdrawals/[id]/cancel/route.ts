import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";
import { ServerCSRFProtection } from "@/lib/csrf-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Clone request to avoid body consumption issues
    const clonedRequest = request.clone();

    // CRITICAL: Validate CSRF token BEFORE cancelling financial transactions
    const isValidCSRF = await ServerCSRFProtection.validateRequestToken(clonedRequest);
    if (!isValidCSRF) {
      return new Response(JSON.stringify({ error: "Invalid CSRF token" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Remove CSRF token from body before forwarding to backend
    // The client-side CSRF token should not be sent to internal services
    const { csrf_token, ...sanitizedBody } = body;

    return proxyToBackend("POST", `/internal/withdrawals/${encodeURIComponent(id)}/cancel`, { body: sanitizedBody });
  } catch (error) {
    console.error('Invalid JSON in withdrawal cancel request:', error);
    return new Response(JSON.stringify({ error: "Invalid request format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
