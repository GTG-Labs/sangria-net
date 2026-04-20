import type { SangriaRequestData, FixedPriceOptions } from "../types.js";
import { Sangria, validateFixedPriceOptions } from "../core.js";
import { SangriaError } from "../errors.js";

/**
 * Minimal type stubs for Next.js request/response.
 *
 * We intentionally avoid importing from "next/server" so the adapter
 * compiles without next as a dependency. Consumers get full type safety
 * from their own Next.js installation. The `any` fallbacks here only
 * affect SDK internals, not the developer-facing API.
 */
type NextRequest = {
  headers: { get(name: string): string | null };
  url: string;
};

type NextResponse = any;

type NextRouteHandler = (
  request: any,
  context?: any
) => Promise<NextResponse> | NextResponse;

export interface NextJSConfig {
  bypassPaymentIf?: (request: any) => boolean;
}

// ── Entry point: wrap a route handler to gate it behind payment ──
//
//   import { fixedPrice } from "@sangria-sdk/core/nextjs";
//
//   export const GET = fixedPrice(sangria, { price: 0.01 }, handler);
//   export const POST = fixedPrice(sangria, { price: 0.01 }, handler, config);
//
export function fixedPrice(
  sangria: Sangria,
  options: FixedPriceOptions,
  handler: NextRouteHandler,
  config?: NextJSConfig
): NextRouteHandler {
  validateFixedPriceOptions(options);

  return async (request: any, context?: any) => {
    // 1. Bypass check — let the request through without payment
    if (config?.bypassPaymentIf?.(request)) {
      request.sangria = { paid: false, amount: 0 } as SangriaRequestData;
      return handler(request, context);
    }

    // 2. Extract payment context from the request
    const paymentHeader =
      request.headers.get("payment-signature") ?? undefined;
    const resourceUrl = request.url;

    // 3. Call core payment logic
    const result = await sangria.handleFixedPrice(
      { paymentHeader, resourceUrl },
      options
    );

    // 4. Block: return 402 challenge or error response
    if (result.action === "respond") {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...result.headers,
      };
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers,
      });
    }

    // 5. Proceed: attach payment data to request, run handler
    request.sangria = result.data;
    return handler(request, context);
  };
}

// ── Helper to read payment data from the request ──
//
//   const payment = getSangria(request);
//   if (payment?.paid) { /* payment succeeded */ }
//
export function getSangria(
  request: any
): SangriaRequestData | undefined {
  return request.sangria;
}

// ── Wrap a route to catch SangriaError and respond cleanly ──
//
// Next.js App Router has no global error middleware, so wrap your routes:
//
//   export const GET = withSangriaErrorHandler(
//     fixedPrice(sangria, { price: 0.01 }, handler)
//   );
//
// If Sangria is unreachable, the agent gets a 503 response instead of
// a framework-default 500 stack trace.
//
export function withSangriaErrorHandler(
  handler: NextRouteHandler
): NextRouteHandler {
  return async (request: any, context?: any) => {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof SangriaError) {
        return new Response(
          JSON.stringify({ error: "Payment provider unavailable" }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
      throw err;
    }
  };
}
