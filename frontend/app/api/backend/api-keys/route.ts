import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

export async function GET() {
  return proxyToBackend("GET", "/api-keys");
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return proxyToBackend("POST", "/api-keys", { body });
}
