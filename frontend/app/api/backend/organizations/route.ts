import { proxyToBackend } from "@/lib/api-proxy";

export async function POST(request: Request) {
  try {
    // Parse JSON with isolated error handling
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error('Invalid JSON in organization POST request:', error);
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

    return proxyToBackend("POST", "/internal/organizations", { body: sanitizedBody }, request);
  } catch (error) {
    console.error('Error in organization POST request:', error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}