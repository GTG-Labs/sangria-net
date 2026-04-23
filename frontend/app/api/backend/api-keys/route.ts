import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const queryString = url.searchParams.toString();
  const path = queryString ? `/internal/api-keys?${queryString}` : "/internal/api-keys";
  return proxyToBackend("GET", path, undefined, request);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    return proxyToBackend("POST", "/internal/merchants", { body: sanitizedBody }, request);
  } catch (error) {
    console.error('Invalid JSON in POST request:', error);
    return new Response(JSON.stringify({ error: "Invalid request format" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}