import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api-proxy";

export async function GET(request: NextRequest) {
  return proxyToBackend("GET", "/internal/me", undefined, request);
}