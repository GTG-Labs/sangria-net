import { generateCSRFTokenResponse } from "@/lib/csrf-server";

export async function GET() {
  return generateCSRFTokenResponse();
}