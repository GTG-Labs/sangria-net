import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Single audit surface for every process.env read in this app.
// Validation runs at build time — a missing or malformed var fails the build
// rather than silently falling back in prod. Add new vars here; do not
// scatter process.env.X reads across the codebase.
export const env = createEnv({
  server: {
    BACKEND_URL: z.url(),
    // x402 demo route (`app/api/x402-pay/route.ts`) — buyer-side credentials
    // used to sign payments as the agent. These are demo-only secrets, not
    // the backend's CDP creds. Format validation (e.g. isAddress for the
    // buyer wallet) happens at the call site.
    SANGRIA_SECRET_KEY: z.string().min(1),
    BUYER_ADDRESS: z.string().min(1),
    CDP_API_KEY_NAME: z.string().min(1),
    CDP_API_KEY_PRIVATE_KEY: z.string().min(1),
    CDP_WALLET_SECRET: z.string().min(1),
    // Optional override for the public origin used in demo resource URLs.
    // When unset, the x402-pay route derives it from the incoming request.
    MYTHOS_BASE_URL: z.url().optional(),
  },
  client: {
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.url(),
  },
  // Next.js build-time inlines the literal process.env.NEXT_PUBLIC_X, so
  // each NEXT_PUBLIC_* entry must appear verbatim here or the bundle ships
  // without it. Server vars must also be listed so the runtime has access.
  runtimeEnv: {
    BACKEND_URL: process.env.BACKEND_URL,
    SANGRIA_SECRET_KEY: process.env.SANGRIA_SECRET_KEY,
    BUYER_ADDRESS: process.env.BUYER_ADDRESS,
    CDP_API_KEY_NAME: process.env.CDP_API_KEY_NAME,
    CDP_API_KEY_PRIVATE_KEY: process.env.CDP_API_KEY_PRIVATE_KEY,
    CDP_WALLET_SECRET: process.env.CDP_WALLET_SECRET,
    MYTHOS_BASE_URL: process.env.MYTHOS_BASE_URL,
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  },
});
