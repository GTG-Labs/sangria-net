import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";
import { ServerCSRFProtection } from "@/lib/csrf-server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const queryString = url.searchParams.toString();
  const path = queryString ? `/internal/api-keys?${queryString}` : "/internal/api-keys";
  return proxyToBackend("GET", path);
}

export async function POST(request: NextRequest) {
  try {
    // Clone request to avoid body consumption issues
    const clonedRequest = request.clone();

    // Validate CSRF token BEFORE processing any operations
    const isValidCSRF = await ServerCSRFProtection.validateRequestToken(clonedRequest);
    if (!isValidCSRF) {
      return new Response(JSON.stringify({ error: "Invalid CSRF token" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Remove CSRF token from body before forwarding to backend
    // The client-side CSRF token should not be sent to internal services
    const { csrf_token: _csrf_token, ...sanitizedBody } = body;

    return proxyToBackend("POST", "/internal/merchants", { body: sanitizedBody });
  } catch (error) {
    console.error('Invalid JSON in POST request:', error);
    return new Response(JSON.stringify({ error: "Invalid request format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}