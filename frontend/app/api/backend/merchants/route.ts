import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const url = new URL(request.url);
  const queryString = url.searchParams.toString();
  const path = queryString ? `/internal/merchants?${queryString}` : "/internal/merchants";
  return proxyToBackend("POST", path, { body });
}