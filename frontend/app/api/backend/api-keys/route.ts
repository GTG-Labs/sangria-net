import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const queryString = url.searchParams.toString();
  const path = queryString ? `/internal/api-keys?${queryString}` : "/internal/api-keys";
  return proxyToBackend("GET", path);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyToBackend("POST", "/internal/merchants", { body });
}