import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    // Re-throw unexpected errors to maintain existing error handling
    throw error;
  }

  const url = new URL(request.url);
  const queryString = url.searchParams.toString();
  const path = queryString ? `/internal/merchants?${queryString}` : "/internal/merchants";
  return proxyToBackend("POST", path, { body });
}