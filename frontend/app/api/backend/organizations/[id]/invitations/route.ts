import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
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

    // Defensive: strip csrf_token from the body before forwarding. Current
    // clients send it as the X-CSRF-Token header only, not in the body, so
    // this is a no-op for normal traffic. Kept to stop a misbehaving client
    // from leaking the raw token into the backend's /internal/* handlers.
    const { csrf_token: _csrf_token, ...sanitizedBody } = body;

    return proxyToBackend("POST", `/internal/organizations/${encodeURIComponent(id)}/invitations`, { body: sanitizedBody }, request);
  } catch (error) {
    console.error('Error in organization invitation request:', error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}