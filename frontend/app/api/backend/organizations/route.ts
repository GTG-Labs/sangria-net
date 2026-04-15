import { proxyToBackend } from "@/lib/api-proxy";

export async function POST(request: Request) {
  const body = await request.json();
  return proxyToBackend("POST", "/internal/organizations", { body });
}