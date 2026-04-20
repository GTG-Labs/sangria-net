import { NextRequest, NextResponse } from "next/server";
import { Sangria } from "@sangria-sdk/core";
import { fixedPrice, withSangriaErrorHandler } from "@sangria-sdk/core/nextjs";

const sangria = new Sangria({
  apiKey: process.env.SANGRIA_SECRET_KEY ?? "sk_test_abc123",
  baseUrl: process.env.SANGRIA_URL ?? "http://localhost:8080",
});

// GET /api/premium → $0.01 (fixed)
// withSangriaErrorHandler catches SangriaError and returns a 503 to the agent
// instead of Next.js's default 500. Without it, a flaky Sangria backend would
// surface as an opaque 500 to callers.
export const GET = withSangriaErrorHandler(
  fixedPrice(
    sangria,
    { price: 0.01, description: "Access premium content" },
    async (_request: NextRequest) => {
      return NextResponse.json({
        message: "You accessed the premium endpoint!",
      });
    }
  )
);
