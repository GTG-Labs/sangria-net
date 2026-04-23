import { NextResponse } from "next/server";
import { ServerCSRFProtection } from "@/lib/csrf-server";

export async function POST(request: Request) {
  try {
    // Clone request to avoid body consumption issues
    const clonedRequest = request.clone();

    // Validate CSRF token BEFORE accepting invitations
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
    const { csrf_token: _csrf_token, ...sanitizedBody } = body;

    // Call backend directly (no auth required)
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";

    const response = await fetch(`${backendUrl}/accept-invitation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sanitizedBody),
    });

    const data = await response.text();

    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Failed to accept invitation:", error);
    return NextResponse.json(
      { error: "Failed to connect to backend" },
      { status: 500 }
    );
  }
}